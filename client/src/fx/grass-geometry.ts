import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";

export type GrassPatchOptions = {
  width?: number;
  depth?: number;
  columns?: number;
  rows?: number;
  minHeight?: number;
  maxHeight?: number;
  bladeWidth?: number;
  seed?: number;
};

export type GrassSurfaceOptions = {
  density?: number;
  maxBlades?: number;
  minHeight?: number;
  maxHeight?: number;
  bladeWidth?: number;
  seed?: number;
  minimumUpNormal?: number;
};

function randomGenerator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

export function createGrassPatch(
  scene: BJS.Scene,
  options: GrassPatchOptions = {},
): BJS.Mesh {
  const width = options.width ?? 16;
  const depth = options.depth ?? 14;
  const columns = options.columns ?? 72;
  const rows = options.rows ?? 64;
  const minHeight = options.minHeight ?? 0.38;
  const maxHeight = options.maxHeight ?? 0.82;
  const bladeWidth = options.bladeWidth ?? 0.065;
  const random = randomGenerator(options.seed ?? 0xe17a_91a);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const appendQuad = (
    anchorX: number,
    anchorZ: number,
    height: number,
    angle: number,
    widthScale: number,
  ) => {
    const directionX = Math.cos(angle);
    const directionZ = Math.sin(angle);
    const halfWidth = bladeWidth * widthScale;
    const leftX = -directionX * halfWidth;
    const leftZ = -directionZ * halfWidth;
    const normalX = -directionZ;
    const normalZ = directionX;
    const base = positions.length / 3;
    positions.push(
      anchorX + leftX, 0, anchorZ + leftZ,
      anchorX - leftX, 0, anchorZ - leftZ,
      anchorX + leftX * 0.24, height, anchorZ + leftZ * 0.24,
      anchorX - leftX * 0.24, height, anchorZ - leftZ * 0.24,
    );
    for (let index = 0; index < 4; index++) {
      normals.push(normalX, 0.18, normalZ);
    }
    uvs.push(0, 0, 1, 0, 0, 1, 1, 1);
    indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  };

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const anchorX =
        ((column + 0.18 + random() * 0.64) / columns - 0.5) * width;
      const anchorZ =
        ((row + 0.18 + random() * 0.64) / rows - 0.5) * depth;
      const height = minHeight + (maxHeight - minHeight) * random();
      const angle = random() * Math.PI;
      const widthScale = 0.72 + random() * 0.52;
      appendQuad(anchorX, anchorZ, height, angle, widthScale);
      appendQuad(anchorX, anchorZ, height * 0.94, angle + Math.PI * 0.5, widthScale);
    }
  }

  const mesh = new BABYLON.Mesh("RequiemGrassPatch", scene);
  const vertexData = new BABYLON.VertexData();
  vertexData.positions = positions;
  vertexData.normals = normals;
  vertexData.uvs = uvs;
  vertexData.indices = indices;
  vertexData.applyToMesh(mesh, false);
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.freezeWorldMatrix();
  return mesh;
}

export function createGrassForSurface(
  surface: BJS.Mesh,
  scene: BJS.Scene,
  options: GrassSurfaceOptions = {},
): BJS.Mesh | null {
  const sourcePositions = surface.getVerticesData(
    BABYLON.VertexBuffer.PositionKind,
  );
  const sourceIndices = surface.getIndices();
  if (!sourcePositions || !sourceIndices?.length) return null;

  const density = options.density ?? 1.15;
  const maxBlades = options.maxBlades ?? 12_000;
  const minimumUpNormal = options.minimumUpNormal ?? 0.58;
  const minHeight = options.minHeight ?? 0.32;
  const maxHeight = options.maxHeight ?? 0.68;
  const bladeWidth = options.bladeWidth ?? 0.052;
  const random = randomGenerator(options.seed ?? 0xe17a_91a);
  const triangles: Array<{
    a: number;
    b: number;
    c: number;
    area: number;
    cumulativeArea: number;
  }> = [];
  let totalArea = 0;

  for (let index = 0; index + 2 < sourceIndices.length; index += 3) {
    const a = sourceIndices[index]! * 3;
    const b = sourceIndices[index + 1]! * 3;
    const c = sourceIndices[index + 2]! * 3;
    const abX = sourcePositions[b]! - sourcePositions[a]!;
    const abY = sourcePositions[b + 1]! - sourcePositions[a + 1]!;
    const abZ = sourcePositions[b + 2]! - sourcePositions[a + 2]!;
    const acX = sourcePositions[c]! - sourcePositions[a]!;
    const acY = sourcePositions[c + 1]! - sourcePositions[a + 1]!;
    const acZ = sourcePositions[c + 2]! - sourcePositions[a + 2]!;
    const normalX = abY * acZ - abZ * acY;
    const normalY = abZ * acX - abX * acZ;
    const normalZ = abX * acY - abY * acX;
    const doubleArea = Math.hypot(normalX, normalY, normalZ);
    if (doubleArea <= 1e-6 || Math.abs(normalY) / doubleArea < minimumUpNormal) {
      continue;
    }
    const area = doubleArea * 0.5;
    totalArea += area;
    triangles.push({ a, b, c, area, cumulativeArea: totalArea });
  }
  if (!triangles.length || totalArea <= 0) return null;

  const bladeCount = Math.min(
    maxBlades,
    Math.max(1, Math.round(totalArea * density)),
  );
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const appendQuad = (
    anchorX: number,
    anchorY: number,
    anchorZ: number,
    height: number,
    angle: number,
    widthScale: number,
  ) => {
    const directionX = Math.cos(angle);
    const directionZ = Math.sin(angle);
    const halfWidth = bladeWidth * widthScale;
    const leftX = -directionX * halfWidth;
    const leftZ = -directionZ * halfWidth;
    const normalX = -directionZ;
    const normalZ = directionX;
    const base = positions.length / 3;
    positions.push(
      anchorX + leftX, anchorY, anchorZ + leftZ,
      anchorX - leftX, anchorY, anchorZ - leftZ,
      anchorX + leftX * 0.24, anchorY + height, anchorZ + leftZ * 0.24,
      anchorX - leftX * 0.24, anchorY + height, anchorZ - leftZ * 0.24,
    );
    for (let vertex = 0; vertex < 4; vertex++) {
      normals.push(normalX, 0.18, normalZ);
    }
    uvs.push(0, 0, 1, 0, 0, 1, 1, 1);
    indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  };

  for (let blade = 0; blade < bladeCount; blade++) {
    const targetArea = random() * totalArea;
    let low = 0;
    let high = triangles.length - 1;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (triangles[middle]!.cumulativeArea < targetArea) low = middle + 1;
      else high = middle;
    }
    const triangle = triangles[low]!;
    const rootU = Math.sqrt(random());
    const baryA = 1 - rootU;
    const baryB = rootU * (1 - random());
    const baryC = 1 - baryA - baryB;
    const anchorX =
      sourcePositions[triangle.a]! * baryA +
      sourcePositions[triangle.b]! * baryB +
      sourcePositions[triangle.c]! * baryC;
    const anchorY =
      sourcePositions[triangle.a + 1]! * baryA +
      sourcePositions[triangle.b + 1]! * baryB +
      sourcePositions[triangle.c + 1]! * baryC +
      0.012;
    const anchorZ =
      sourcePositions[triangle.a + 2]! * baryA +
      sourcePositions[triangle.b + 2]! * baryB +
      sourcePositions[triangle.c + 2]! * baryC;
    const height = minHeight + (maxHeight - minHeight) * random();
    const angle = random() * Math.PI;
    const widthScale = 0.72 + random() * 0.52;
    appendQuad(anchorX, anchorY, anchorZ, height, angle, widthScale);
    appendQuad(
      anchorX,
      anchorY,
      anchorZ,
      height * 0.94,
      angle + Math.PI * 0.5,
      widthScale,
    );
  }

  const mesh = new BABYLON.Mesh(`RequiemGrass:${surface.name}`, scene);
  const vertexData = new BABYLON.VertexData();
  vertexData.positions = positions;
  vertexData.normals = normals;
  vertexData.uvs = uvs;
  vertexData.indices = indices;
  vertexData.applyToMesh(mesh, false);
  mesh.setParent(surface);
  mesh.isPickable = false;
  mesh.checkCollisions = false;
  mesh.alwaysSelectAsActiveMesh = false;
  mesh.metadata = {
    ...mesh.metadata,
    requiemGrassBladeCount: bladeCount,
    requiemGrassSource: surface.name,
  };
  mesh.refreshBoundingInfo();
  return mesh;
}
