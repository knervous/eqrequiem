#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
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
        const expected = accessorValues(
          before,
          primitive.attributes[semantic],
        );
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
      const positions = accessorValues(
        before,
        primitive.attributes.POSITION,
      );
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
    throw new Error(`Baked-lighting verification failed: ${failures.join("; ")}`);
  }
}

async function main() {
  const options = argumentsFor(process.argv.slice(2));
  const zone = String(options.zone ?? "qeynos2").toLowerCase();
  const blender =
    process.env.BLENDER_BIN ??
    "/Applications/Blender.app/Contents/MacOS/Blender";
  const scene = path.join(
    repoRoot,
    "client/public/eqrequiem/worlds",
    `${zone}.glb.gz`,
  );
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

  const lighting = JSON.parse(await fs.readFile(field, "utf8"));
  if (
    lighting.schema !== "eltania.zone-vertex-lighting" ||
    lighting.version !== 1
  ) {
    throw new Error(`Blender emitted an incompatible lighting field`);
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
  const output = path.join(
    repoRoot,
    "client/public/eqrequiem/worlds",
    `${zone}.baked-preview.glb.gz`,
  );
  const compressed = gzipSync(bytes, { level: 9 });
  await fs.writeFile(output, compressed);
  if (options.promote) await fs.writeFile(scene, compressed);
  console.log(
    JSON.stringify(
      {
        zone,
        meshes: baked.applied,
        staticLights: lighting.lightCount,
        aoRays: lighting.aoRays,
        minimumRgb: lighting.minimumRgb,
        maximumRgb: lighting.maximumRgb,
        bytes: compressed.byteLength,
        output,
        promoted: Boolean(options.promote),
      },
      null,
      2,
    ),
  );
}

await main();
