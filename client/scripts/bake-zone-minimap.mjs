import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import sharp from "sharp";

const HEADER_BYTES = 40;
const OUTPUT_SIZE = 1024;
const zone = process.argv[2]?.trim().toLowerCase();

if (!zone || !/^[a-z0-9_-]+$/.test(zone)) {
  throw new Error("Usage: node scripts/bake-zone-minimap.mjs <zone>");
}

const worldRoot = path.resolve("public/eqrequiem/worlds");
const outputRoot = path.resolve("public/eltania/maps");
const spatialPath = path.join(worldRoot, `${zone}.spatial.json.gz`);
const spatialBytes = gunzipSync(await readFile(spatialPath));
const spatial = JSON.parse(spatialBytes.toString("utf8"));
const collisionPath = path.join(worldRoot, spatial.collision.source);
const collisionBytes = gunzipSync(await readFile(collisionPath));
const view = new DataView(
  collisionBytes.buffer,
  collisionBytes.byteOffset,
  collisionBytes.byteLength,
);
const vertexCount = view.getUint32(8, true);
const indexCount = view.getUint32(12, true);
const positions = new Float32Array(vertexCount * 3);
let offset = HEADER_BYTES;
for (let index = 0; index < positions.length; index++, offset += 4) {
  positions[index] = view.getFloat32(offset, true);
}
const indices = new Uint32Array(indexCount);
for (let index = 0; index < indices.length; index++, offset += 4) {
  indices[index] = view.getUint32(offset, true);
}

const [worldMinX, worldMinY, worldMinZ] = spatial.collision.bounds.min;
const [worldMaxX, worldMaxY, worldMaxZ] = spatial.collision.bounds.max;
const span = Math.max(worldMaxX - worldMinX, worldMaxZ - worldMinZ);
const centerX = (worldMinX + worldMaxX) / 2;
const centerZ = (worldMinZ + worldMaxZ) / 2;
const minX = centerX - span / 2;
const maxX = centerX + span / 2;
const minZ = centerZ - span / 2;
const maxZ = centerZ + span / 2;
const elevationSpan = Math.max(1, worldMaxY - worldMinY);
const triangles = [];

const project = (vertexIndex) => {
  const source = vertexIndex * 3;
  return {
    x: ((positions[source] - minX) / span) * OUTPUT_SIZE,
    y: ((maxZ - positions[source + 2]) / span) * OUTPUT_SIZE,
    elevation: positions[source + 1],
  };
};

for (let index = 0; index < indices.length; index += 3) {
  const a = project(indices[index]);
  const b = project(indices[index + 1]);
  const c = project(indices[index + 2]);
  const area = Math.abs(
    (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y),
  );
  if (area < 0.015) continue;

  const sourceA = indices[index] * 3;
  const sourceB = indices[index + 1] * 3;
  const sourceC = indices[index + 2] * 3;
  const ab = [
    positions[sourceB] - positions[sourceA],
    positions[sourceB + 1] - positions[sourceA + 1],
    positions[sourceB + 2] - positions[sourceA + 2],
  ];
  const ac = [
    positions[sourceC] - positions[sourceA],
    positions[sourceC + 1] - positions[sourceA + 1],
    positions[sourceC + 2] - positions[sourceA + 2],
  ];
  const normal = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
  const normalLength = Math.max(0.0001, Math.hypot(...normal));
  const upward = Math.abs(normal[1]) / normalLength;
  const elevation = (a.elevation + b.elevation + c.elevation) / 3;
  triangles.push({ a, b, c, area, upward, elevation });
}

triangles.sort((left, right) => left.elevation - right.elevation);
const polygons = triangles.map(({ a, b, c, area, upward, elevation }) => {
  const height = Math.max(0, Math.min(1, (elevation - worldMinY) / elevationSpan));
  const wall = upward < 0.24;
  const lightness = wall
    ? 15 + height * 12
    : 21 + height * 25 + upward * 6;
  const saturation = wall ? 10 : 14 + upward * 7;
  const hue = wall ? 35 : 54 + height * 10;
  const stroke = wall || area > 8
    ? `stroke="hsla(39, 30%, ${Math.min(62, lightness + 13)}%, .34)" stroke-width=".48"`
    : "";
  return `<polygon points="${a.x.toFixed(2)},${a.y.toFixed(2)} ${b.x.toFixed(2)},${b.y.toFixed(2)} ${c.x.toFixed(2)},${c.y.toFixed(2)}" fill="hsl(${hue.toFixed(0)} ${saturation.toFixed(0)}% ${lightness.toFixed(0)}%)" ${stroke}/>`;
}).join("");

const svg = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="${OUTPUT_SIZE}" height="${OUTPUT_SIZE}" viewBox="0 0 ${OUTPUT_SIZE} ${OUTPUT_SIZE}">
    <defs>
      <radialGradient id="ground" cx="50%" cy="45%" r="72%">
        <stop offset="0" stop-color="#24271f"/>
        <stop offset="1" stop-color="#0c100f"/>
      </radialGradient>
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency=".72" numOctaves="2" seed="17"/>
        <feColorMatrix values="0 0 0 0 .55 0 0 0 0 .48 0 0 0 0 .34 0 0 0 .08 0"/>
      </filter>
    </defs>
    <rect width="1024" height="1024" fill="url(#ground)"/>
    ${polygons}
    <rect width="1024" height="1024" filter="url(#grain)" opacity=".28"/>
  </svg>
`);

await mkdir(outputRoot, { recursive: true });
const imageName = `${zone}-topdown-v1.webp`;
const metadataName = `${zone}-topdown-v1.json`;
await sharp(svg)
  .resize(OUTPUT_SIZE, OUTPUT_SIZE)
  .webp({ quality: 88, effort: 6 })
  .toFile(path.join(outputRoot, imageName));
await writeFile(
  path.join(outputRoot, metadataName),
  `${JSON.stringify({
    kind: "eltania.zone-minimap",
    version: 1,
    zone,
    image: `/eltania/maps/${imageName}`,
    north: "+x",
    rotationDegrees: -90,
    size: OUTPUT_SIZE,
    bounds: { minX, maxX, minZ, maxZ },
    source: {
      spatial: `/eqrequiem/worlds/${zone}.spatial.json.gz`,
      collision: `/eqrequiem/worlds/${spatial.collision.source}`,
      collisionHash: spatial.collision.contentHash,
      layoutHash: spatial.integrity.layoutHash,
    },
  }, null, 2)}\n`,
);

console.log(`Baked ${zone}: ${triangles.length} projected triangles -> ${imageName}`);
