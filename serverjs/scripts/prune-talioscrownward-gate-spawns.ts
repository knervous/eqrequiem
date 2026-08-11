import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { gzipSync } from "node:zlib";

import BetterSqlite3 from "better-sqlite3";

import { OFFLINE_SEED_VERSION } from "../src/backend/offline-seed.js";

/**
 * Remove the inherited holiday/event cohort from Crownward's ordinary gate approach.
 *
 * These rows came from Qeynos seasonal content and survived the first zone re-home as
 * renamed residents. They are not part of Talios fiction and visually read as specialty
 * NPCs placed in the arrival route. The migration deletes only their zone spawn points;
 * shared archetypes and groups remain available to any explicit event content.
 */

const root = resolve(import.meta.dirname, "..");
const databasePath = resolve(root, "data/content-db.sqlite");
const gzipPath = `${databasePath}.gz`;
const artifactPath = resolve(
  root,
  "artifacts/talioscrownward-spawns/gate-specialty-prune-v1.json",
);
const checkpointPath = resolve(
  root,
  "artifacts/talioscrownward-spawns/checkpoints/content-db-before-gate-specialty-prune-v1.sqlite.gz",
);
const zoneId = 2;
const targets = new Map<number, string>([
  [148712, "a_winterfeast_imp"],
  [148729, "Hargen_the_Hearthcook"],
  [148746, "Firewright_Fabdren"],
  [148763, "Sedwin_Kingsley"],
]);

type RemovedSpawn = {
  id: number;
  names: string[];
  spawnGroupId: number;
  position: { x: number; y: number; z: number };
  heading: number;
  wasEnabled: boolean;
};

type SpawnRow = {
  id: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  enabled: number;
  spawn_group_id: number;
  names: string;
};

mkdirSync(dirname(checkpointPath), { recursive: true });
try {
  readFileSync(checkpointPath);
} catch {
  try {
    copyFileSync(gzipPath, checkpointPath);
  } catch {
    writeFileSync(checkpointPath, gzipSync(readFileSync(databasePath), { level: 9 }));
  }
}

const db = new BetterSqlite3(databasePath);
const rows = db.prepare(`
  SELECT sp.id, sp.x, sp.y, sp.z, sp.heading, sp.enabled, sp.spawn_group_id,
    GROUP_CONCAT(npc.name, ' | ') AS names
  FROM spawn_points sp
  JOIN spawn_group_members member ON member.spawn_group_id = sp.spawn_group_id
  JOIN npc_archetypes npc ON npc.id = member.npc_archetype_id
  WHERE sp.zone_id = ? AND sp.id IN (${[...targets.keys()].map(() => "?").join(", ")})
  GROUP BY sp.id
  ORDER BY sp.id
`).all(zoneId, ...targets.keys()) as SpawnRow[];

const mismatches = rows.filter((row) => !row.names.split(" | ").includes(targets.get(row.id)!));
if (mismatches.length > 0) {
  db.close();
  throw new Error(`Refusing to prune repurposed spawn ids: ${mismatches.map((row) => row.id).join(", ")}`);
}

const missingBeforeRun = [...targets.keys()].filter((id) => !rows.some((row) => row.id === id));
const remove = db.prepare("DELETE FROM spawn_points WHERE zone_id = ? AND id = ?");
const markArtifactVersion = db.prepare(`
  INSERT INTO content_artifact_meta (key, value) VALUES ('version', ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);
const apply = db.transaction(() => {
  for (const row of rows) remove.run(zoneId, row.id);
  markArtifactVersion.run(OFFLINE_SEED_VERSION);
});

try {
  apply();
  db.exec("VACUUM");
} finally {
  db.close();
}

const databaseBytes = readFileSync(databasePath);
const compressed = gzipSync(databaseBytes, { level: 9 });
writeFileSync(gzipPath, compressed);

let previousRemoved: RemovedSpawn[] = [];
try {
  const previous = JSON.parse(readFileSync(artifactPath, "utf8")) as {
    kind?: string;
    removed?: RemovedSpawn[];
  };
  if (previous.kind === "eltania.talioscrownward.gate-specialty-prune") {
    previousRemoved = previous.removed ?? [];
  }
} catch {
  // The first successful run has no prior result artifact to retain.
}
const removedThisRun = rows.map((row) => ({
  id: row.id,
  names: row.names.split(" | "),
  spawnGroupId: row.spawn_group_id,
  position: { x: row.x, y: row.y, z: row.z },
  heading: row.heading,
  wasEnabled: row.enabled === 1,
}));
const removed = removedThisRun.length > 0 ? removedThisRun : previousRemoved;

const artifact = {
  kind: "eltania.talioscrownward.gate-specialty-prune",
  version: 1,
  zone: "talioscrownward",
  authority: "talioscrownward-gate-composition-pass-v1",
  disposition: "spawn-point-deleted; shared archetype and spawn group retained",
  checkpoint: checkpointPath.slice(resolve(root, "..").length + 1),
  removedCount: removed.length,
  removedThisRunCount: removedThisRun.length,
  alreadyAbsentCount: missingBeforeRun.length,
  removed,
  alreadyAbsent: missingBeforeRun,
  offlineSeedVersion: OFFLINE_SEED_VERSION,
  checks: [
    { name: "target-identity-matches", passed: mismatches.length === 0 },
    { name: "only-gate-specialty-targets-removed", passed: rows.every((row) => targets.has(row.id)) },
  ],
  databaseBytes: databaseBytes.byteLength,
  gzipBytes: compressed.byteLength,
  gzipSha256: createHash("sha256").update(compressed).digest("hex"),
};
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({ ...artifact, artifactPath }, null, 2));
