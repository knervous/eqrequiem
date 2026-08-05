#!/usr/bin/env node

/**
 * Promote authored (non-catalog) zone-object prototypes to runtime.
 *
 * Catalog prototypes come from the pinned RoF2 extraction and are promoted by
 * promote-zone-object-assets.mjs. Authored prototypes have no catalog entry:
 * their source is a checked-in GLB under assets/src/world/objects/authored/,
 * conditioned by the guarded Blender recipe. Both kinds publish to the same
 * /eqrequiem/objects/<id>/final.glb.gz runtime URL, so the spatial package and
 * the client object cache need no authored-object branch.
 *
 *   node client/scripts/promote-authored-zone-objects.mjs [--condition] [id...]
 *
 * --condition re-runs the Blender conditioning recipe before promoting. Without
 * it, the existing conditioned.glb is reused after its report is verified.
 */

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { readAuthoredRegistry } from "./authored-object-registry.mjs";
import { preprocessZoneObjectGlb } from "./promote-zone-object-assets.mjs";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const outputRoot = path.join(repoRoot, "client/public/eqrequiem/objects");
const manifestFile = path.join(outputRoot, "authored-manifest.json");
const blender = "/Users/Paul/Downloads/Blender.app/Contents/MacOS/Blender";
const recipe = path.join(
  repoRoot,
  "assets/pipeline/condition_authored_zone_object.py",
);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: repoRoot, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            `${command} exited with ${signal ? `signal ${signal}` : `code ${code}`}`,
          ),
        );
      }
    });
  });
}

export async function promoteAuthoredZoneObjects({
  ids = [],
  condition = false,
} = {}) {
  const registry = await readAuthoredRegistry();
  const selected = ids.length
    ? registry.objects.filter((entry) => ids.includes(entry.id))
    : registry.objects;
  ensure(selected.length, `No authored objects matched ${ids.join(", ")}`);
  for (const id of ids) {
    ensure(
      selected.some((entry) => entry.id === id),
      `'${id}' is not a registered authored object`,
    );
  }

  // Validate every payload before touching public output, so a late failure
  // cannot leave the runtime holding a half-promoted set.
  const processed = [];
  for (const entry of selected) {
    const directory = path.dirname(path.join(repoRoot, entry.source));
    if (condition) {
      await run(blender, [
        "--background",
        "--python",
        recipe,
        "--",
        "--id",
        entry.id,
      ]);
    }

    const reportFile = path.join(directory, "conditioning.json");
    const conditionedFile = path.join(directory, "conditioned.glb");
    const report = JSON.parse(await fs.readFile(reportFile, "utf8"));
    const conditioned = await fs.readFile(conditionedFile);

    ensure(
      report.kind === "requiem.authored-object-conditioning" &&
        report.version === 1,
      `${entry.id} conditioning report has an unsupported contract`,
    );
    ensure(report.id === entry.id, `${entry.id} report targets ${report.id}`);
    ensure(report.status === "pass", `${entry.id} conditioning did not pass`);

    // The report is only evidence if it still describes the bytes on disk and
    // the source those bytes were derived from.
    const source = await fs.readFile(path.join(repoRoot, entry.source));
    ensure(
      sha256(source) === entry.sourceSha256 &&
        report.sourceSha256 === entry.sourceSha256,
      `${entry.id} authored source checksum changed since conditioning`,
    );
    ensure(
      sha256(conditioned) === report.outputSha256,
      `${entry.id} conditioned payload changed since its report was written`,
    );
    ensure(
      report.textureSize === entry.textureSize &&
        report.lodMesh === entry.lodMesh &&
        report.geometry.triangles === entry.sourceTriangles,
      `${entry.id} conditioning does not match the registered contract`,
    );
    ensure(
      report.boundingRadius <= entry.boundsRadius + 1e-3,
      `${entry.id} boundsRadius ${entry.boundsRadius} does not contain ` +
        `its ${report.boundingRadius} bounding radius`,
    );
    // Origin at the footprint base is what lets a stamp position be a ground
    // coordinate rather than a model center.
    const [minX, minY, minZ] = report.geometry.boundsMin;
    ensure(
      Math.abs(minY) < 1e-3,
      `${entry.id} does not sit on the ground plane (minY ${minY})`,
    );
    ensure(
      Math.abs(minX + report.geometry.boundsMax[0]) < 1e-3 &&
        Math.abs(minZ + report.geometry.boundsMax[2]) < 1e-3,
      `${entry.id} footprint is not centered on its origin`,
    );

    const runtime = preprocessZoneObjectGlb(conditioned, entry.id);
    const compressed = gzipSync(runtime, { level: 9 });
    processed.push({ entry, runtime, compressed, report });
  }

  for (const object of processed) {
    const directory = path.join(outputRoot, object.entry.id);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, "final.glb.gz"), object.compressed);
  }

  const manifest = {
    kind: "requiem.authored-object-assets",
    version: 1,
    coordinateSystem: "babylon-y-up",
    runtimeHandedness: "right",
    sourceTransform: "identity",
    objects: processed
      .map(({ entry, runtime, compressed, report }) => ({
        id: entry.id,
        source: `/eqrequiem/objects/${entry.id}/final.glb.gz`,
        authoredSource: entry.source,
        sourceSha256: entry.sourceSha256,
        conditionedSha256: report.outputSha256,
        contentSha256: sha256(runtime),
        compressedSha256: sha256(compressed),
        bytes: runtime.byteLength,
        compressedBytes: compressed.byteLength,
        boundsRadius: entry.boundsRadius,
        triangles: report.geometry.triangles,
        dimensions: report.geometry.dimensions,
        zones: entry.zones,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
  await fs.writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(
    `Promoted ${processed.length} authored object assets ` +
      `(${processed.reduce((sum, o) => sum + o.compressed.byteLength, 0)} ` +
      "compressed bytes)",
  );
  return { manifest, manifestFile };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  await promoteAuthoredZoneObjects({
    condition: args.includes("--condition"),
    ids: args.filter((argument) => !argument.startsWith("--")),
  });
}
