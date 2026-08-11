import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ZoneJoinProjection } from "./zone-join-service.js";
import {
  questNpcProjection,
  questPlayerProjection,
  zoneRuntimePlayerProjection,
} from "./zone-runtime-projections.js";

describe("shared zone runtime projections", () => {
  it("gives worker and embedded hosts the same player and quest identity", () => {
    const join = {
      character: {
        id: 17,
        name: "Rook",
        level: 9,
        race_id: 2,
        gender: 1,
        class_id: 4,
        face: 3,
      },
      position: { x: 10, y: 20, z: 30, heading: 64 },
      combat: { maximumHp: 240, stamina: 80 },
      techniques: {
        learned: new Set(["warrior.bash"]),
        prepared: new Map([[0, "warrior.bash"]]),
      },
      bind: { zoneId: 2, instanceId: 0, x: 1, y: 2, z: 3, heading: 4 },
    } as unknown as ZoneJoinProjection;

    const player = zoneRuntimePlayerProjection(join, 5, 0x8000_0011);
    assert.equal(player.characterId, 17);
    assert.deepEqual(player.learned, ["warrior.bash"]);
    assert.deepEqual(player.prepared, ["warrior.bash"]);
    assert.deepEqual(questPlayerProjection(player), {
      kind: "player",
      sessionId: 5,
      characterId: 17,
      id: 0x8000_0011,
      name: "Rook",
      level: 9,
      classId: 4,
      raceId: 2,
      gender: 1,
      position: { x: 10, y: 20, z: 30, heading: 64 },
    });
  });

  it("projects NPC quest identity without adapter-specific field choices", () => {
    assert.deepEqual(questNpcProjection({
      spawnId: 42,
      npcArchetypeId: 7,
      name: "Archivist",
      level: 12,
      race: 8,
      gender: 0,
      x: 1,
      y: 2,
      z: 3,
      heading: 4,
    }, 6), {
      kind: "npc",
      id: 42,
      npcId: 7,
      npcIndex: 6,
      name: "Archivist",
      level: 12,
      raceId: 8,
      gender: 0,
      position: { x: 1, y: 2, z: 3, heading: 4 },
    });
  });
});
