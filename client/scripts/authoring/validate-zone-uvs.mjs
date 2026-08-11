import {
  accessorValues,
  parseGlb,
} from "../material-ai/glb-material-palette.mjs";

const COLLAPSED_FACE_SPAN = 0.01;
const COLLAPSED_FACE_RATIO = 0.95;

function materialTextureCoordinates(material) {
  const coordinates = new Set();
  const bindings = [
    material?.pbrMetallicRoughness?.baseColorTexture,
    material?.pbrMetallicRoughness?.metallicRoughnessTexture,
    material?.normalTexture,
    material?.occlusionTexture,
    material?.emissiveTexture,
  ];
  for (const binding of bindings) {
    if (Number.isInteger(binding?.index)) coordinates.add(binding.texCoord ?? 0);
  }
  return [...coordinates].sort((a, b) => a - b);
}

function primitiveLabel(mesh, meshIndex, primitiveIndex, material) {
  return (
    `${mesh.name ?? `mesh-${meshIndex}`}/primitive-${primitiveIndex}` +
    ` (${material?.name ?? "unnamed material"})`
  );
}

export function auditZoneUvDocument(
  document,
  { readAccessor = accessorValues } = {},
) {
  const { json } = document;
  const failures = [];
  let texturedPrimitives = 0;
  let auditedTriangleFaces = 0;
  let auditedUvChannels = 0;

  for (const [meshIndex, mesh] of (json.meshes ?? []).entries()) {
    for (const [primitiveIndex, primitive] of (mesh.primitives ?? []).entries()) {
      const material = json.materials?.[primitive.material];
      const textureCoordinates = materialTextureCoordinates(material);
      if (!textureCoordinates.length) continue;
      texturedPrimitives++;
      const label = primitiveLabel(mesh, meshIndex, primitiveIndex, material);

      for (const texCoord of textureCoordinates) {
        const accessorIndex = primitive.attributes?.[`TEXCOORD_${texCoord}`];
        if (!Number.isInteger(accessorIndex)) {
          failures.push(`${label} is missing TEXCOORD_${texCoord}`);
          continue;
        }
        auditedUvChannels++;
        const values = readAccessor(document, accessorIndex);
        const positionAccessor = json.accessors?.[primitive.attributes?.POSITION];
        const indices = Number.isInteger(primitive.indices)
          ? readAccessor(document, primitive.indices).map((value) => value[0])
          : Array.from({ length: positionAccessor?.count ?? values.length }, (_, index) => index);
        if ((primitive.mode ?? 4) !== 4) continue;

        let faceCount = 0;
        let collapsedFaceCount = 0;
        let maximumFaceSpan = 0;
        for (let index = 0; index + 2 < indices.length; index += 3) {
          const triangle = indices.slice(index, index + 3).map((vertexIndex) => values[vertexIndex]);
          if (triangle.some((value) => !value || value.length < 2)) {
            failures.push(`${label} has a TEXCOORD_${texCoord} index outside its accessor`);
            break;
          }
          const u = triangle.map((value) => value[0]);
          const v = triangle.map((value) => value[1]);
          const span = Math.max(
            Math.max(...u) - Math.min(...u),
            Math.max(...v) - Math.min(...v),
          );
          if (!Number.isFinite(span)) {
            failures.push(`${label} has non-finite TEXCOORD_${texCoord} values`);
            break;
          }
          faceCount++;
          maximumFaceSpan = Math.max(maximumFaceSpan, span);
          if (span < COLLAPSED_FACE_SPAN) collapsedFaceCount++;
        }
        auditedTriangleFaces += faceCount;
        const collapsedRatio = faceCount ? collapsedFaceCount / faceCount : 0;
        if (
          faceCount > 0 &&
          collapsedRatio >= COLLAPSED_FACE_RATIO &&
          maximumFaceSpan < COLLAPSED_FACE_SPAN
        ) {
          failures.push(
            `${label} has collapsed TEXCOORD_${texCoord}: ` +
              `${collapsedFaceCount}/${faceCount} faces below ${COLLAPSED_FACE_SPAN}, ` +
              `maximum span ${maximumFaceSpan.toExponential(3)}`,
          );
        }
      }
    }
  }

  if (!texturedPrimitives) failures.push("zone GLB contains no textured primitives");
  return {
    status: failures.length ? "fail" : "pass",
    texturedPrimitives,
    auditedUvChannels,
    auditedTriangleFaces,
    collapsedFaceSpan: COLLAPSED_FACE_SPAN,
    collapsedFaceRatio: COLLAPSED_FACE_RATIO,
    failures,
  };
}

export function auditZoneUvGlb(bytes) {
  return auditZoneUvDocument(parseGlb(bytes));
}

export function requireZoneUvContract(bytes, label = "authored zone") {
  const report = auditZoneUvGlb(bytes);
  if (report.failures.length) {
    const detail = report.failures.slice(0, 12).join("; ");
    const remainder = Math.max(0, report.failures.length - 12);
    throw new Error(
      `${label} failed the mandatory UV pass: ${detail}` +
        (remainder ? `; and ${remainder} more failure(s)` : ""),
    );
  }
  return report;
}
