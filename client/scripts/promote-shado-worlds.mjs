import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceDirectory = path.resolve(
  here,
  "../../shader-object/sandbox/public/shado/worlds",
);
const outputDirectory = path.resolve(here, "../public/eqrequiem/worlds");
const requestedZone = process.argv[2]?.toLowerCase();

await fs.mkdir(outputDirectory, { recursive: true });
const entries = await fs.readdir(sourceDirectory, { withFileTypes: true });
const spatialArtifacts = entries
  .filter(
    (entry) =>
      entry.isFile() &&
      entry.name.endsWith(".spatial.json.gz") &&
      (!requestedZone ||
        entry.name === `${requestedZone}.spatial.json.gz`),
  )
  .map((entry) => entry.name)
  .sort();

if (!spatialArtifacts.length) {
  throw new Error(
    requestedZone
      ? `No promoted spatial package found for '${requestedZone}'`
      : "No promoted spatial packages found",
  );
}

let copied = 0;
for (const spatial of spatialArtifacts) {
  const zone = spatial.slice(0, -".spatial.json.gz".length);
  const artifacts = [
    spatial,
    `${zone}.glb.gz`,
    `${zone}.collision.bin.gz`,
  ];
  for (const artifact of artifacts) {
    const source = path.join(sourceDirectory, artifact);
    try {
      await fs.copyFile(source, path.join(outputDirectory, artifact));
      copied++;
    } catch (error) {
      if (artifact === spatial) throw error;
      throw new Error(
        `Promoted world '${zone}' is missing required artifact '${artifact}'`,
        { cause: error },
      );
    }
  }
}

console.log(
  `Promoted ${spatialArtifacts.length} Shado world package(s) ` +
    `(${copied} artifacts) into ${outputDirectory}`,
);
