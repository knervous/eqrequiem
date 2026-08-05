/**
 * The authored zone-object registry: prototypes built from checked-in sources
 * rather than the pinned RoF2 catalog extraction.
 *
 * Both object promoters read this. Keeping it in its own module avoids an
 * import cycle between the catalog promoter and the authored promoter.
 */

import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../..");

export const authoredRegistryFile = path.join(
  repoRoot,
  "assets/src/world/objects/authored/manifest.json",
);

export async function readAuthoredRegistry() {
  const registry = JSON.parse(await fs.readFile(authoredRegistryFile, "utf8"));
  if (
    registry.kind !== "requiem.authored-object-sources" ||
    registry.version !== 1
  ) {
    throw new Error("Unsupported authored-object registry");
  }
  return registry;
}

/** Prototype IDs the catalog promoter must not try to resolve from RoF2. */
export async function authoredObjectIds() {
  const registry = await readAuthoredRegistry();
  return new Set(registry.objects.map((entry) => entry.id));
}
