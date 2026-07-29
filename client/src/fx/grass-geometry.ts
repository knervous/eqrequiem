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
