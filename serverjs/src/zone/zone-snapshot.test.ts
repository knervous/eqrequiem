import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CorpseLootSystem } from "../combat/corpse-loot.js";
import { applyCanonicalRuntimeSchema } from "../db/canonical-schema.js";
import { createNodeDatabase } from "../db/node/factory.js";
import { ZoneSnapshotRepository } from "../persist/zone-snapshot-repository.js";
import { EntityKind, type NPC } from "./entity-store.js";
import type { MovementRoute } from "./movement-routes.js";
import type { ZoneNpcSpawnDefinition } from "./zone-content.js";
import { loadZoneSimulationKernel } from "./zone-kernel-node.js";
import {
  captureZoneSnapshot,
  decodeZoneSnapshot,
  encodeZoneSnapshot,
  restoreZoneSnapshot,
  type ZoneSnapshot,
} from "./zone-snapshot.js";

describe("zone snapshots", () => {
  it("round-trips NPC state, route progress, corpse lifecycle, and remaining loot", async () => {
    const definition = npcDefinition();
    const source = await loadZoneSimulationKernel("debug");
    const sourceNpc = hydrateNpc(source, definition);
    const sourceLoot = new CorpseLootSystem(source.entities);
    sourceLoot.registerSpawn(definition.spawnId, definition.name, definition.lootItems);
    sourceNpc.position.set(8, 9, 10);
    sourceNpc.heading = 1.25;
    sourceNpc.currentHp = 0;
    sourceLoot.createCorpse(sourceNpc);
    const sourceRoutes = new Map<number, MovementRoute>([[
      sourceNpc.index,
      {
        points: definition.path,
        targetIndex: 1,
        pauseUntilMs: 6_000,
      },
    ]]);
    const snapshot = captureZoneSnapshot({
      zoneId: 2,
      instanceId: 3,
      tick: 42,
      simulationTimeMs: 5_000,
      definitions: [definition],
      entities: source.entities,
      movementRoutes: sourceRoutes,
      corpseLoot: sourceLoot,
      capturedAtMs: 123_456,
    });

    const decoded = decodeZoneSnapshot(encodeZoneSnapshot(snapshot));
    assert.equal(decoded.entities[0]?.lootItems?.[0]?.itemId, 500);
    assert.deepEqual(decoded.entities[0]?.movement, {
      targetIndex: 1,
      pauseRemainingMs: 1_000,
    });

    const target = await loadZoneSimulationKernel("debug");
    const targetNpc = hydrateNpc(target, definition);
    const targetLoot = new CorpseLootSystem(target.entities);
    targetLoot.registerSpawn(definition.spawnId, definition.name, definition.lootItems);
    const routes = new Map<number, MovementRoute>([[
      targetNpc.index,
      { points: definition.path, targetIndex: 1, pauseUntilMs: 0 },
    ]]);
    const report = restoreZoneSnapshot(decoded, {
      zoneId: 2,
      instanceId: 3,
      simulationTimeMs: 100,
      definitions: [definition],
      entities: target.entities,
      movementRoutes: routes,
      corpseLoot: targetLoot,
    });

    assert.deepEqual(report, {
      applied: 1,
      skippedUnknown: 0,
      skippedArchetype: 0,
      contentChanged: false,
    });
    assert.equal(targetNpc.kind, EntityKind.corpse);
    assert.deepEqual(
      [targetNpc.position.x, targetNpc.position.y, targetNpc.position.z],
      [8, 9, 10],
    );
    assert.equal(targetNpc.heading, 1.25);
    assert.equal(routes.has(targetNpc.index), false);
    assert.equal(targetLoot.snapshotItems(targetNpc.id)[0]?.itemId, 500);
  });

  it("stores blobs and selects the newest snapshot through the shared repository", async () => {
    const database = createNodeDatabase("sqlite::memory:");
    await applyCanonicalRuntimeSchema(database);
    const repository = new ZoneSnapshotRepository(database);
    const first = emptySnapshot(1);
    const second = emptySnapshot(2);
    await repository.save(10, 0, encodeZoneSnapshot(first));
    await repository.save(10, 0, encodeZoneSnapshot(second));

    const latest = await repository.latest(10, 0);
    assert.equal(latest?.snapshot.simulation.tick, 2);
    assert.equal(await repository.latest(11, 0), null);
    await database.close();
  });

  it("skips removed and replaced content entities without failing restoration", async () => {
    const definition = npcDefinition();
    const target = await loadZoneSimulationKernel("debug");
    const npc = hydrateNpc(target, definition);
    const loot = new CorpseLootSystem(target.entities);
    loot.registerSpawn(definition.spawnId, definition.name, definition.lootItems);
    const snapshot: ZoneSnapshot = {
      formatVersion: 1,
      zoneId: 2,
      instanceId: 0,
      capturedAtMs: 1,
      simulation: { tick: 1, elapsedMs: 1 },
      contentSignature: "old-content",
      entities: [{
        spawnId: definition.spawnId,
        npcArchetypeId: 999,
        lifecycle: "alive",
        position: { x: 90, y: 90, z: 90 },
        heading: 0,
        currentHp: 1,
        maximumHp: 1,
      }, {
        spawnId: 777,
        npcArchetypeId: 888,
        lifecycle: "alive",
        position: { x: 80, y: 80, z: 80 },
        heading: 0,
        currentHp: 1,
        maximumHp: 1,
      }],
    };

    const report = restoreZoneSnapshot(snapshot, {
      zoneId: 2,
      instanceId: 0,
      simulationTimeMs: 0,
      definitions: [definition],
      entities: target.entities,
      movementRoutes: new Map(),
      corpseLoot: loot,
    });
    assert.deepEqual(report, {
      applied: 0,
      skippedUnknown: 1,
      skippedArchetype: 1,
      contentChanged: true,
    });
    assert.deepEqual([npc.position.x, npc.position.y, npc.position.z], [1, 2, 3]);
  });
});

function hydrateNpc(
  kernel: Awaited<ReturnType<typeof loadZoneSimulationKernel>>,
  definition: ZoneNpcSpawnDefinition,
): NPC {
  const npc = kernel.entities.spawnNPCAt(0, {
    id: definition.spawnId,
    x: definition.x,
    y: definition.y,
    z: definition.z,
    speed: definition.movementSpeed,
  });
  npc.maximumHp = definition.maximumHp;
  npc.currentHp = definition.maximumHp;
  return npc;
}

function emptySnapshot(tick: number): ZoneSnapshot {
  return {
    formatVersion: 1,
    zoneId: 10,
    instanceId: 0,
    capturedAtMs: tick,
    simulation: { tick, elapsedMs: tick * 100 },
    contentSignature: "",
    entities: [],
  };
}

function npcDefinition(): ZoneNpcSpawnDefinition {
  return {
    spawnId: 100,
    spawnPointId: 100,
    spawnGroupId: 10,
    npcArchetypeId: 20,
    name: "a_rat",
    level: 1,
    race: 36,
    gender: 2,
    modelKey: null,
    movementSpeed: 1,
    size: 1,
    face: 0,
    helm: 0,
    equipChest: 0,
    primary: 0,
    secondary: 0,
    charClass: 1,
    bodyType: 1,
    maximumHp: 100,
    strength: 75,
    stamina: 75,
    dexterity: 75,
    agility: 75,
    offense: 5,
    defense: 5,
    armorClass: 0,
    weaponDamage: 2,
    attackDelayMs: 2_500,
    haste: 0,
    meleeRange: 3,
    lootItems: [{ itemId: 500, name: "Rat Ear", slot: 0, quantity: 1 }],
    x: 1,
    y: 2,
    z: 3,
    heading: 0,
    path: [
      { x: 1, y: 2, z: 3, heading: 0, pauseSeconds: 0 },
      { x: 5, y: 2, z: 3, heading: 0, pauseSeconds: 2 },
    ],
  };
}
