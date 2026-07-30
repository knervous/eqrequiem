import {
  float32ToUint32,
  pack2x16Snorm,
  pack2x16Unorm,
  packRgba8Unorm,
  uint32ToFloat32,
  unpack2x16Snorm,
  unpack2x16Unorm,
  unpackRgba8Unorm,
} from './PackedCodecs';

export type ActorProjectionEncoding = 'split-f32' | 'packed';
export type ActorProjectionStream = 'transform' | 'appearance';
export type ActorProjectionUploadMode = 'none' | 'direct' | 'scatter' | 'full';

export interface ActorProjectionActor {
  readonly translation: ArrayLike<number>;
  readonly rotation: ArrayLike<number>;
  readonly color: ArrayLike<number>;
}

export interface ActorProjectionDomain {
  origin: readonly [number, number, number];
  extent: readonly [number, number, number];
  scaleRange?: readonly [number, number];
}

export interface ActorProjectionUploadPolicy {
  /** Maximum number of CPU-issued range writes before choosing scatter/full. */
  maxDirectRanges?: number;
  /** Changed-row fraction that switches directly to a full stream write. */
  fullUploadFraction?: number;
  /** Permit a slot-indexed delta payload for a future compute scatter pass. */
  allowScatter?: boolean;
}

export interface ActorRenderProjectionConfig {
  encoding: ActorProjectionEncoding;
  domain?: ActorProjectionDomain;
  initialCapacity?: number;
  uploadPolicy?: ActorProjectionUploadPolicy;
}

export interface ActorProjectionUploadRange {
  readonly firstRow: number;
  readonly rowCount: number;
  readonly byteOffset: number;
  readonly data: Uint32Array;
}

export interface ActorProjectionShapeSpan {
  readonly name: string;
  readonly offsetWords: number;
  readonly wordCount: number;
}

export interface ActorProjectionScatterBatch {
  readonly shapeName: string;
  readonly destinationStrideWords: number;
  readonly destinationOffsetWords: number;
  readonly copyWords: number;
  readonly changedRows: number;
  /** Tightly packed `[slot, span words...]` records. */
  readonly data: Uint32Array;
}

export interface ActorProjectionStreamPlan {
  readonly stream: ActorProjectionStream;
  readonly mode: ActorProjectionUploadMode;
  readonly strideWords: number;
  readonly changedRows: number;
  readonly encodedBytes: number;
  readonly uploadedBytes: number;
  readonly uploadCalls: number;
  readonly ranges: readonly ActorProjectionUploadRange[];
  /**
   * Shape-specialized batches selected against the cost of whole-row scatter.
   * It is intentionally renderer-neutral; Lite currently falls back to full.
   */
  readonly scatterBatches?: readonly ActorProjectionScatterBatch[];
  /** @deprecated Use scatterBatches. Present only for a single whole-row batch. */
  readonly scatterData?: Uint32Array;
}

export interface ActorProjectionSyncOptions {
  /** Aggregate actor dirtiness. New rows are included automatically. */
  dirtyFlags?: ArrayLike<boolean | number>;
  /** Avoid scanning a large dirty flag array when changed slots are known. */
  dirtyIndices?: Iterable<number>;
}

export interface ActorProjectionSyncResult {
  readonly count: number;
  readonly capacity: number;
  readonly candidateRows: number;
  readonly residentBytes: number;
  readonly transform: ActorProjectionStreamPlan;
  readonly appearance: ActorProjectionStreamPlan;
  readonly encodedBytes: number;
  readonly uploadedBytes: number;
  readonly uploadCalls: number;
}

export interface DecodedProjectedActor {
  translation: [number, number, number, number];
  rotation: [number, number, number, number];
  color: [number, number, number, number];
}

const DEFAULT_POLICY: Required<ActorProjectionUploadPolicy> = {
  maxDirectRanges: 32,
  fullUploadFraction: 0.35,
  allowScatter: false,
};

function nextCapacity(current: number, required: number): number {
  let capacity = Math.max(4, current | 0);
  while (capacity < required) capacity *= 2;
  return capacity;
}

function assertFiniteTuple(value: readonly number[], length: number, name: string): void {
  if (value.length !== length || value.some(component => !Number.isFinite(component))) {
    throw new Error(`${name} must contain ${length} finite values.`);
  }
}

function normalizeDomain(domain?: ActorProjectionDomain): Required<ActorProjectionDomain> {
  const normalized: Required<ActorProjectionDomain> = {
    origin: domain?.origin ?? [0, 0, 0],
    extent: domain?.extent ?? [1, 1, 1],
    scaleRange: domain?.scaleRange ?? [0, 16],
  };
  assertFiniteTuple(normalized.origin, 3, 'Actor projection origin');
  assertFiniteTuple(normalized.extent, 3, 'Actor projection extent');
  assertFiniteTuple(normalized.scaleRange, 2, 'Actor projection scaleRange');
  if (normalized.extent.some(component => component <= 0)) {
    throw new Error('Actor projection extent values must be greater than zero.');
  }
  if (normalized.scaleRange[1] <= normalized.scaleRange[0]) {
    throw new Error('Actor projection scaleRange maximum must exceed its minimum.');
  }
  return normalized;
}

function wordSpanEqual(
  target: Uint32Array,
  rowOffset: number,
  scratch: Uint32Array,
  span: ActorProjectionShapeSpan
): boolean {
  const end = span.offsetWords + span.wordCount;
  for (let word = span.offsetWords; word < end; word++) {
    if (target[rowOffset + word] !== scratch[word]) return false;
  }
  return true;
}

function copyWords(
  target: Uint32Array,
  rowOffset: number,
  scratch: Uint32Array,
  words: number
): void {
  for (let i = 0; i < words; i++) target[rowOffset + i] = scratch[i];
}

export class ActorRenderProjection {
  readonly encoding: ActorProjectionEncoding;
  readonly domain: Required<ActorProjectionDomain>;
  readonly transformStrideWords: number;
  readonly appearanceStrideWords: number;
  readonly transformShape: readonly ActorProjectionShapeSpan[];
  readonly appearanceShape: readonly ActorProjectionShapeSpan[];

  private readonly policy: Required<ActorProjectionUploadPolicy>;
  private transformStorage = new Uint32Array(0);
  private appearanceStorage = new Uint32Array(0);
  private candidateMarks = new Uint8Array(0);
  private readonly transformScratch = new Uint32Array(8);
  private readonly appearanceScratch = new Uint32Array(4);
  private countValue = 0;
  private capacityValue = 0;
  private initialized = false;

  constructor(config: ActorRenderProjectionConfig) {
    this.encoding = config.encoding;
    this.domain = normalizeDomain(config.domain);
    this.transformStrideWords = config.encoding === 'packed' ? 4 : 8;
    this.appearanceStrideWords = config.encoding === 'packed' ? 1 : 4;
    this.transformShape =
      config.encoding === 'packed'
        ? [
            { name: 'positionScale', offsetWords: 0, wordCount: 2 },
            { name: 'rotation', offsetWords: 2, wordCount: 2 },
          ]
        : [
            { name: 'translation', offsetWords: 0, wordCount: 4 },
            { name: 'rotation', offsetWords: 4, wordCount: 4 },
          ];
    this.appearanceShape = [
      {
        name: 'color',
        offsetWords: 0,
        wordCount: this.appearanceStrideWords,
      },
    ];
    this.policy = { ...DEFAULT_POLICY, ...config.uploadPolicy };
    if (this.policy.maxDirectRanges < 1) {
      throw new Error('maxDirectRanges must be at least one.');
    }
    if (this.policy.fullUploadFraction <= 0 || this.policy.fullUploadFraction > 1) {
      throw new Error('fullUploadFraction must be in (0, 1].');
    }
    if (config.initialCapacity) this.reserve(config.initialCapacity);
  }

  get count(): number {
    return this.countValue;
  }

  get capacity(): number {
    return this.capacityValue;
  }

  get transformWords(): Uint32Array {
    return this.transformStorage;
  }

  get appearanceWords(): Uint32Array {
    return this.appearanceStorage;
  }

  reserve(required: number): boolean {
    if (required <= this.capacityValue) return false;
    const capacity = nextCapacity(this.capacityValue, required);
    const transforms = new Uint32Array(capacity * this.transformStrideWords);
    const appearances = new Uint32Array(capacity * this.appearanceStrideWords);
    transforms.set(this.transformStorage);
    appearances.set(this.appearanceStorage);
    this.transformStorage = transforms;
    this.appearanceStorage = appearances;
    this.candidateMarks = new Uint8Array(capacity);
    this.capacityValue = capacity;
    return true;
  }

  sync(
    actors: readonly ActorProjectionActor[],
    options: ActorProjectionSyncOptions = {}
  ): ActorProjectionSyncResult {
    const previousCount = this.countValue;
    const grew = this.reserve(actors.length);
    const structural = grew || !this.initialized;
    const candidates: number[] = [];

    const addCandidate = (index: number) => {
      if (index < 0 || index >= actors.length || this.candidateMarks[index] !== 0) {
        return;
      }
      this.candidateMarks[index] = 1;
      candidates.push(index);
    };

    if (structural) {
      for (let index = 0; index < actors.length; index++) addCandidate(index);
    } else {
      if (options.dirtyIndices) {
        for (const index of options.dirtyIndices) addCandidate(index);
      }
      if (options.dirtyFlags) {
        const length = Math.min(options.dirtyFlags.length, actors.length);
        for (let index = 0; index < length; index++) {
          if (options.dirtyFlags[index]) addCandidate(index);
        }
      }
      for (let index = previousCount; index < actors.length; index++) addCandidate(index);
    }

    candidates.sort((a, b) => a - b);
    const transformChanged: number[] = [];
    const appearanceChanged: number[] = [];
    const transformSpanChanged = this.transformShape.map(() => [] as number[]);
    const appearanceSpanChanged = this.appearanceShape.map(() => [] as number[]);

    for (const index of candidates) {
      const actor = actors[index];
      this.encodeTransform(actor, this.transformScratch);
      const transformOffset = index * this.transformStrideWords;
      let transformRowChanged = false;
      for (let spanIndex = 0; spanIndex < this.transformShape.length; spanIndex++) {
        if (
          structural ||
          !wordSpanEqual(
            this.transformStorage,
            transformOffset,
            this.transformScratch,
            this.transformShape[spanIndex]
          )
        ) {
          transformSpanChanged[spanIndex].push(index);
          transformRowChanged = true;
        }
      }
      if (transformRowChanged) {
        copyWords(
          this.transformStorage,
          transformOffset,
          this.transformScratch,
          this.transformStrideWords
        );
        transformChanged.push(index);
      }

      this.encodeAppearance(actor, this.appearanceScratch);
      const appearanceOffset = index * this.appearanceStrideWords;
      let appearanceRowChanged = false;
      for (let spanIndex = 0; spanIndex < this.appearanceShape.length; spanIndex++) {
        if (
          structural ||
          !wordSpanEqual(
            this.appearanceStorage,
            appearanceOffset,
            this.appearanceScratch,
            this.appearanceShape[spanIndex]
          )
        ) {
          appearanceSpanChanged[spanIndex].push(index);
          appearanceRowChanged = true;
        }
      }
      if (appearanceRowChanged) {
        copyWords(
          this.appearanceStorage,
          appearanceOffset,
          this.appearanceScratch,
          this.appearanceStrideWords
        );
        appearanceChanged.push(index);
      }
      this.candidateMarks[index] = 0;
    }

    this.countValue = actors.length;
    this.initialized = true;
    const transform = this.buildPlan(
      'transform',
      this.transformStorage,
      this.transformStrideWords,
      transformChanged,
      this.transformShape,
      transformSpanChanged,
      structural
    );
    const appearance = this.buildPlan(
      'appearance',
      this.appearanceStorage,
      this.appearanceStrideWords,
      appearanceChanged,
      this.appearanceShape,
      appearanceSpanChanged,
      structural
    );

    return {
      count: actors.length,
      capacity: this.capacityValue,
      candidateRows: candidates.length,
      residentBytes:
        this.capacityValue *
        (this.transformStrideWords + this.appearanceStrideWords) *
        Uint32Array.BYTES_PER_ELEMENT,
      transform,
      appearance,
      encodedBytes: transform.encodedBytes + appearance.encodedBytes,
      uploadedBytes: transform.uploadedBytes + appearance.uploadedBytes,
      uploadCalls: transform.uploadCalls + appearance.uploadCalls,
    };
  }

  decode(index: number): DecodedProjectedActor {
    if (index < 0 || index >= this.countValue) {
      throw new RangeError(`Actor projection index ${index} is out of range.`);
    }
    if (this.encoding === 'split-f32') {
      const transformOffset = index * this.transformStrideWords;
      const appearanceOffset = index * this.appearanceStrideWords;
      return {
        translation: [
          uint32ToFloat32(this.transformStorage[transformOffset]),
          uint32ToFloat32(this.transformStorage[transformOffset + 1]),
          uint32ToFloat32(this.transformStorage[transformOffset + 2]),
          uint32ToFloat32(this.transformStorage[transformOffset + 3]),
        ],
        rotation: [
          uint32ToFloat32(this.transformStorage[transformOffset + 4]),
          uint32ToFloat32(this.transformStorage[transformOffset + 5]),
          uint32ToFloat32(this.transformStorage[transformOffset + 6]),
          uint32ToFloat32(this.transformStorage[transformOffset + 7]),
        ],
        color: [
          uint32ToFloat32(this.appearanceStorage[appearanceOffset]),
          uint32ToFloat32(this.appearanceStorage[appearanceOffset + 1]),
          uint32ToFloat32(this.appearanceStorage[appearanceOffset + 2]),
          uint32ToFloat32(this.appearanceStorage[appearanceOffset + 3]),
        ],
      };
    }

    const transformOffset = index * this.transformStrideWords;
    const [nx, ny] = unpack2x16Unorm(this.transformStorage[transformOffset]);
    const [nz, ns] = unpack2x16Unorm(this.transformStorage[transformOffset + 1]);
    const [qx, qy] = unpack2x16Snorm(this.transformStorage[transformOffset + 2]);
    const [qz, qw] = unpack2x16Snorm(this.transformStorage[transformOffset + 3]);
    const quaternionLength = Math.hypot(qx, qy, qz, qw) || 1;
    const scaleRange = this.domain.scaleRange;
    return {
      translation: [
        this.domain.origin[0] + nx * this.domain.extent[0],
        this.domain.origin[1] + ny * this.domain.extent[1],
        this.domain.origin[2] + nz * this.domain.extent[2],
        scaleRange[0] + ns * (scaleRange[1] - scaleRange[0]),
      ],
      rotation: [
        qx / quaternionLength,
        qy / quaternionLength,
        qz / quaternionLength,
        qw / quaternionLength,
      ],
      color: unpackRgba8Unorm(this.appearanceStorage[index * this.appearanceStrideWords]),
    };
  }

  private encodeTransform(actor: ActorProjectionActor, output: Uint32Array): void {
    if (this.encoding === 'split-f32') {
      for (let index = 0; index < 4; index++) {
        output[index] = float32ToUint32(actor.translation[index] ?? 0);
        output[index + 4] = float32ToUint32(actor.rotation[index] ?? 0);
      }
      return;
    }
    const translation = actor.translation;
    const rotation = actor.rotation;
    const origin = this.domain.origin;
    const extent = this.domain.extent;
    const scaleRange = this.domain.scaleRange;
    output[0] = pack2x16Unorm(
      ((translation[0] ?? 0) - origin[0]) / extent[0],
      ((translation[1] ?? 0) - origin[1]) / extent[1]
    );
    output[1] = pack2x16Unorm(
      ((translation[2] ?? 0) - origin[2]) / extent[2],
      ((translation[3] ?? 1) - scaleRange[0]) / (scaleRange[1] - scaleRange[0])
    );
    output[2] = pack2x16Snorm(rotation[0] ?? 0, rotation[1] ?? 0);
    output[3] = pack2x16Snorm(rotation[2] ?? 0, rotation[3] ?? 1);
  }

  private encodeAppearance(actor: ActorProjectionActor, output: Uint32Array): void {
    if (this.encoding === 'packed') {
      output[0] = packRgba8Unorm(actor.color);
      return;
    }
    for (let index = 0; index < 4; index++) {
      output[index] = float32ToUint32(actor.color[index] ?? 0);
    }
  }

  private buildPlan(
    stream: ActorProjectionStream,
    storage: Uint32Array,
    strideWords: number,
    changed: readonly number[],
    shape: readonly ActorProjectionShapeSpan[],
    spanChanged: readonly (readonly number[])[],
    structural: boolean
  ): ActorProjectionStreamPlan {
    const encodedBytes = changed.length * strideWords * Uint32Array.BYTES_PER_ELEMENT;
    if (changed.length === 0) {
      return {
        stream,
        mode: 'none',
        strideWords,
        changedRows: 0,
        encodedBytes: 0,
        uploadedBytes: 0,
        uploadCalls: 0,
        ranges: [],
      };
    }

    const full = () => {
      const data = storage.subarray(0, this.countValue * strideWords);
      const range: ActorProjectionUploadRange = {
        firstRow: 0,
        rowCount: this.countValue,
        byteOffset: 0,
        data,
      };
      return {
        stream,
        mode: 'full' as const,
        strideWords,
        changedRows: changed.length,
        encodedBytes,
        uploadedBytes: data.byteLength,
        uploadCalls: data.byteLength ? 1 : 0,
        ranges: data.byteLength ? [range] : [],
      };
    };

    if (
      structural ||
      changed.length / Math.max(1, this.countValue) >= this.policy.fullUploadFraction
    ) {
      return full();
    }

    const runs: Array<{ first: number; last: number }> = [];
    for (const index of changed) {
      const previous = runs[runs.length - 1];
      if (previous && index === previous.last + 1) previous.last = index;
      else runs.push({ first: index, last: index });
    }
    if (runs.length <= this.policy.maxDirectRanges) {
      const ranges = runs.map(run => {
        const start = run.first * strideWords;
        const end = (run.last + 1) * strideWords;
        return {
          firstRow: run.first,
          rowCount: run.last - run.first + 1,
          byteOffset: start * Uint32Array.BYTES_PER_ELEMENT,
          data: storage.subarray(start, end),
        };
      });
      return {
        stream,
        mode: 'direct',
        strideWords,
        changedRows: changed.length,
        encodedBytes,
        uploadedBytes: ranges.reduce((sum, range) => sum + range.data.byteLength, 0),
        uploadCalls: ranges.length,
        ranges,
      };
    }

    if (!this.policy.allowScatter) return full();
    const wholeRow = this.buildScatterBatch(
      storage,
      strideWords,
      { name: 'row', offsetWords: 0, wordCount: strideWords },
      changed
    );
    const shaped = shape.flatMap((span, index) =>
      spanChanged[index].length
        ? [this.buildScatterBatch(storage, strideWords, span, spanChanged[index])]
        : []
    );
    const shapedBytes = shaped.reduce((sum, batch) => sum + batch.data.byteLength, 0);
    const scatterBatches = shapedBytes < wholeRow.data.byteLength ? shaped : [wholeRow];
    const uploadedBytes = scatterBatches.reduce((sum, batch) => sum + batch.data.byteLength, 0);
    return {
      stream,
      mode: 'scatter',
      strideWords,
      changedRows: changed.length,
      encodedBytes,
      uploadedBytes,
      uploadCalls: scatterBatches.length,
      ranges: [],
      scatterBatches,
      scatterData:
        scatterBatches.length === 1 && scatterBatches[0].copyWords === strideWords
          ? scatterBatches[0].data
          : undefined,
    };
  }

  private buildScatterBatch(
    storage: Uint32Array,
    strideWords: number,
    span: ActorProjectionShapeSpan,
    changed: readonly number[]
  ): ActorProjectionScatterBatch {
    const data = new Uint32Array(changed.length * (span.wordCount + 1));
    let writeOffset = 0;
    for (const index of changed) {
      data[writeOffset++] = index;
      const sourceOffset = index * strideWords + span.offsetWords;
      data.set(storage.subarray(sourceOffset, sourceOffset + span.wordCount), writeOffset);
      writeOffset += span.wordCount;
    }
    return {
      shapeName: span.name,
      destinationStrideWords: strideWords,
      destinationOffsetWords: span.offsetWords,
      copyWords: span.wordCount,
      changedRows: changed.length,
      data,
    };
  }
}
