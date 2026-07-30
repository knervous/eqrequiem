export const SHADO_SCATTER_WORKGROUP_SIZE = 64;

export interface ComputeScatterShape {
  readonly destinationStrideWords: number;
  readonly destinationOffsetWords?: number;
  readonly copyWords: number;
}

/**
 * Emit a slot-indexed, shape-specialized word scatter kernel.
 *
 * Delta records are tightly packed as `[destination row, selected span words...]`.
 * A separate four-word params buffer carries the live record count so a
 * geometrically grown delta allocation cannot expose stale trailing records.
 */
export function emitComputeScatterWGSL(
  shapeOrStride: number | ComputeScatterShape,
  workgroupSize = SHADO_SCATTER_WORKGROUP_SIZE
): string {
  const shape =
    typeof shapeOrStride === 'number'
      ? {
          destinationStrideWords: shapeOrStride,
          destinationOffsetWords: 0,
          copyWords: shapeOrStride,
        }
      : {
          destinationOffsetWords: 0,
          ...shapeOrStride,
        };
  if (!Number.isInteger(shape.destinationStrideWords) || shape.destinationStrideWords < 1) {
    throw new Error('Compute scatter strideWords must be a positive integer.');
  }
  if (!Number.isInteger(shape.destinationOffsetWords) || shape.destinationOffsetWords < 0) {
    throw new Error('Compute scatter destinationOffsetWords must be a non-negative integer.');
  }
  if (!Number.isInteger(shape.copyWords) || shape.copyWords < 1) {
    throw new Error('Compute scatter copyWords must be a positive integer.');
  }
  if (shape.destinationOffsetWords + shape.copyWords > shape.destinationStrideWords) {
    throw new Error('Compute scatter shape must fit inside the destination stride.');
  }
  if (!Number.isInteger(workgroupSize) || workgroupSize < 1) {
    throw new Error('Compute scatter workgroupSize must be a positive integer.');
  }
  const stores = Array.from(
    { length: shape.copyWords },
    (_, word) =>
      `  shadoScatterDestination[destinationBase + ${word}u] =\n` +
      `    shadoScatterDelta[recordBase + ${word + 1}u];`
  ).join('\n');
  return `
const SHADO_SCATTER_STRIDE_WORDS: u32 = ${shape.destinationStrideWords}u;
const SHADO_SCATTER_OFFSET_WORDS: u32 = ${shape.destinationOffsetWords}u;
const SHADO_SCATTER_COPY_WORDS: u32 = ${shape.copyWords}u;
const SHADO_SCATTER_RECORD_WORDS: u32 = ${shape.copyWords + 1}u;

@group(0) @binding(0)
var<storage, read> shadoScatterDelta: array<u32>;

@group(0) @binding(1)
var<storage, read_write> shadoScatterDestination: array<u32>;

@group(0) @binding(2)
var<storage, read> shadoScatterParams: array<u32>;

@compute @workgroup_size(${workgroupSize})
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let recordIndex = globalId.x;
  if (recordIndex >= shadoScatterParams[0]) {
    return;
  }
  let recordBase = recordIndex * SHADO_SCATTER_RECORD_WORDS;
  let destinationRow = shadoScatterDelta[recordBase];
  let destinationBase =
    destinationRow * SHADO_SCATTER_STRIDE_WORDS + SHADO_SCATTER_OFFSET_WORDS;
${stores}
}
`;
}
