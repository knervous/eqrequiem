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
const artifacts = entries
  .filter(
    (entry) =>
      entry.isFile() &&
      entry.name.endsWith(".spatial.json.gz") &&
      (!requestedZone ||
        entry.name === `${requestedZone}.spatial.json.gz`),
  )
  .map((entry) => entry.name)
  .sort();

if (!artifacts.length) {
  throw new Error(
    requestedZone
      ? `No promoted spatial package found for '${requestedZone}'`
      : "No promoted spatial packages found",
  );
}

for (const artifact of artifacts) {
  await fs.copyFile(
    path.join(sourceDirectory, artifact),
    path.join(outputDirectory, artifact),
  );
}

console.log(
  `Promoted ${artifacts.length} Shado world package(s) into ${outputDirectory}`,
);
