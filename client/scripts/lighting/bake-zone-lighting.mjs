#!/usr/bin/env node

import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import {
  accessorValues,
  appendVertexColorOverrides,
  parseGlb,
  serializeGlb,
  uvSignature,
} from "../material-ai/glb-material-palette.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const publicWorldRoot = path.join(repoRoot, "client/public/eqrequiem/worlds");
const sandboxWorldRoot = path.join(
  repoRoot,
  "shader-object/sandbox/public/shado/worlds",
);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function descriptor(file, bytes) {
  return {
    path: path.relative(repoRoot, file).split(path.sep).join("/"),
    sha256: sha256(bytes),
    bytes: bytes.byteLength,
  };
}

async function promoteBakedAuthority(zone, lighting, sceneBytes) {
  const publicScene = path.join(publicWorldRoot, `${zone}.glb.gz`);
  const publicSpatial = path.join(publicWorldRoot, `${zone}.spatial.json.gz`);
  const sandboxScene = path.join(sandboxWorldRoot, `${zone}.glb.gz`);
  const sandboxSpatial = path.join(sandboxWorldRoot, `${zone}.spatial.json.gz`);
  const baselineFile = path.join(
    publicWorldRoot,
    "legacy-baseline.manifest.json",
  );
  const [storedSpatial, baseline, worldModule] = await Promise.all([
    fs.readFile(publicSpatial),
    fs.readFile(baselineFile, "utf8").then(JSON.parse),
    import(
      pathToFileURL(path.join(repoRoot, "shader-object/dist/world/index.js"))
        .href
    ),
  ]);
  const world = JSON.parse(gunzipSync(storedSpatial));
  const objectColors = lighting.objects ?? {};
  const missing =
    world.objects?.stamps.id.filter((id) => !objectColors[id]) ?? [];
  if (
    missing.length ||
    Object.keys(objectColors).length !== world.objects?.stamps.id.length
  ) {
    throw new Error(
      `Baked object authority does not match spatial stamps; missing ${missing.slice(0, 8).join(", ")}`,
    );
  }
  const rows = world.objects.stamps.id.map((id) => objectColors[id]);
  world.objects.stamps.irradianceR = rows.map((color) => color[0]);
  world.objects.stamps.irradianceG = rows.map((color) => color[1]);
  world.objects.stamps.irradianceB = rows.map((color) => color[2]);
  world.objects.stamps.irradianceA = rows.map((color) => color[3]);
  // Authored local lights/AO are baked, while the real sky and player lights
  // remain dynamic. Hybrid prevents the runtime from treating PBR surfaces as
  // fully unlit without reviving legacy metadata PointLights.
  world.lighting = { mode: "hybrid", vertexColors: "baked-irradiance" };
  worldModule.stampShadoWorldIntegrity(world);
  worldModule.validateShadoWorldPackage(world);
  const spatialBytes = gzipSync(Buffer.from(JSON.stringify(world)), {
    level: 9,
  });
  const entry = [...baseline.zones, ...baseline.clientScenes].find(
    (candidate) => candidate.shortName === zone,
  );
  if (!entry) throw new Error(`No baseline entry for ${zone}`);
  entry.runtime.scene = descriptor(publicScene, sceneBytes);
  entry.runtime.spatial = descriptor(publicSpatial, spatialBytes);
  const baselineBytes = Buffer.from(`${JSON.stringify(baseline, null, 2)}\n`);
  await Promise.all([
    fs.writeFile(publicScene, sceneBytes),
    fs.writeFile(sandboxScene, sceneBytes),
    fs.writeFile(publicSpatial, spatialBytes),
    fs.writeFile(sandboxSpatial, spatialBytes),
    fs.writeFile(baselineFile, baselineBytes),
  ]);
  return {
    spatialBytes: spatialBytes.byteLength,
    layoutHash: world.integrity.layoutHash,
  };
}

function argumentsFor(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (!argument.startsWith("--")) continue;
    const name = argument.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) options[name] = true;
    else {
      options[name] = next;
      index++;
    }
  }
  return options;
}

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code ?? signal}`));
    });
  });
}

function verifyExistingStreams(before, after) {
  const failures = [];
  for (const [meshIndex, mesh] of before.json.meshes.entries()) {
    const bakedMesh = after.json.meshes?.[meshIndex];
    if (mesh.name !== bakedMesh?.name) {
      failures.push(`mesh ${meshIndex} name/order changed`);
      continue;
    }
    for (const [primitiveIndex, primitive] of mesh.primitives.entries()) {
      const bakedPrimitive = bakedMesh.primitives?.[primitiveIndex];
      for (const semantic of ["POSITION", "NORMAL", "TEXCOORD_0"]) {
        const expected = accessorValues(before, primitive.attributes[semantic]);
        const actual = accessorValues(
          after,
          bakedPrimitive.attributes[semantic],
        );
        if (
          expected.length !== actual.length ||
          expected.some((row, rowIndex) =>
            row.some((value, column) => value !== actual[rowIndex][column]),
          )
        ) {
          failures.push(`${mesh.name}/${semantic} changed`);
        }
      }
      const expectedIndices = accessorValues(before, primitive.indices);
      const actualIndices = accessorValues(after, bakedPrimitive.indices);
      if (
        expectedIndices.length !== actualIndices.length ||
        expectedIndices.some(
          (value, index) => value[0] !== actualIndices[index][0],
        )
      ) {
        failures.push(`${mesh.name}/indices changed`);
      }
      const colorAccessor = bakedPrimitive.attributes.COLOR_0;
      const colors = accessorValues(after, colorAccessor);
      const positions = accessorValues(before, primitive.attributes.POSITION);
      if (
        colors.length !== positions.length ||
        colors.some(
          (color) =>
            color.length !== 4 ||
            color.some((value) => !Number.isFinite(value)) ||
            color.some((value) => value < 0 || value > 1),
        )
      ) {
        failures.push(`${mesh.name}/COLOR_0 is invalid`);
      }
    }
  }
  if (uvSignature(before) !== uvSignature(after)) {
    failures.push("UV signature changed");
  }
  if (failures.length) {
    throw new Error(
      `Baked-lighting verification failed: ${failures.join("; ")}`,
    );
  }
}

async function main() {
  const options = argumentsFor(process.argv.slice(2));
  const zone = String(options.zone ?? "qeynos2").toLowerCase();
  const blender =
    process.env.BLENDER_BIN ??
    "/Users/Paul/Downloads/Blender.app/Contents/MacOS/Blender";
  const guardedBlender =
    "/Users/Paul/Downloads/Blender.app/Contents/MacOS/Blender";
  const [resolvedBlender, resolvedGuard] = await Promise.all([
    fs.realpath(blender),
    fs.realpath(guardedBlender),
  ]);
  if (resolvedBlender !== resolvedGuard) {
    throw new Error(
      `Refusing Blender at ${resolvedBlender}; expected guarded Blender 5.2 at ${resolvedGuard}`,
    );
  }
  const scene = path.join(publicWorldRoot, `${zone}.glb.gz`);
  const metadata = path.join(
    repoRoot,
    "assets/reference/everquest_rof2/zones",
    `${zone}.json`,
  );
  const lightingRoot = path.join(
    repoRoot,
    "assets/src/world/zones",
    zone,
    "lighting",
  );
  const field = path.join(lightingRoot, `${zone}.vertex-lighting.json`);
  await fs.mkdir(lightingRoot, { recursive: true });
  if (options["authority-only"]) {
    const [lighting, sceneBytes] = await Promise.all([
      fs.readFile(field, "utf8").then(JSON.parse),
      fs.readFile(scene),
    ]);
    const promotion = await promoteBakedAuthority(zone, lighting, sceneBytes);
    console.log(
      JSON.stringify({ zone, authorityOnly: true, promotion }, null, 2),
    );
    return;
  }
  if (!options["reuse-field"]) {
    await run(blender, [
      "--background",
      "--python",
      path.join(here, "bake-zone-vertex-lighting.py"),
      "--",
      "--scene",
      scene,
      "--metadata",
      metadata,
      "--output",
      field,
      "--ao-rays",
      String(options["ao-rays"] ?? 8),
    ]);
  }

  const lighting = JSON.parse(await fs.readFile(field, "utf8"));
  if (
    lighting.schema !== "eltania.zone-vertex-lighting" ||
    lighting.version !== 2
  ) {
    throw new Error(`Blender emitted an incompatible lighting field`);
  }
  if (
    !lighting.bakedComponents?.includes("metadata-local-lights") ||
    !lighting.bakedComponents?.includes("ambient-occlusion") ||
    !lighting.excludedDynamicComponents?.includes("sun") ||
    !lighting.excludedDynamicComponents?.includes("sky") ||
    !lighting.excludedDynamicComponents?.includes("player-light") ||
    lighting.lightCount < 1 ||
    lighting.localLightDiagnostics?.meshes?.litSampleCount < 1
  ) {
    throw new Error(
      `Lighting field does not prove metadata-local-light/AO authority with dynamic sun, sky, and player light exclusions`,
    );
  }
  const stored = await fs.readFile(scene);
  const before = parseGlb(gunzipSync(stored));
  const colorsByMesh = new Map(Object.entries(lighting.meshes));
  const baked = appendVertexColorOverrides(before, colorsByMesh);
  if (baked.applied !== before.json.meshes.length) {
    const missing = before.json.meshes
      .filter((mesh) => !colorsByMesh.has(mesh.name))
      .map((mesh) => mesh.name);
    throw new Error(
      `Applied lighting to ${baked.applied}/${before.json.meshes.length} meshes; ` +
        `missing ${missing.join(", ")}`,
    );
  }
  const bytes = serializeGlb(baked);
  const after = parseGlb(bytes);
  verifyExistingStreams(before, after);
  const output = path.join(publicWorldRoot, `${zone}.baked-preview.glb.gz`);
  const compressed = gzipSync(bytes, { level: 9 });
  await fs.writeFile(output, compressed);
  const promotion = options.promote
    ? await promoteBakedAuthority(zone, lighting, compressed)
    : null;
  console.log(
    JSON.stringify(
      {
        zone,
        meshes: baked.applied,
        staticLights: lighting.lightCount,
        objects: lighting.objectCount,
        aoRays: lighting.aoRays,
        minimumRgb: lighting.minimumRgb,
        maximumRgb: lighting.maximumRgb,
        bytes: compressed.byteLength,
        output,
        promoted: Boolean(options.promote),
        promotion,
      },
      null,
      2,
    ),
  );
}

await main();
