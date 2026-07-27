import { z } from "zod";

import type { CorpseLootSystem } from "../combat/corpse-loot.js";
import { EntityKind, NPC, type EntityStore } from "./entity-store.js";
import type { MovementRoute } from "./movement-routes.js";
import type { ZoneNpcSpawnDefinition } from "./zone-content.js";

export const ZONE_SNAPSHOT_FORMAT_VERSION = 1;

const finiteNumber = z.number().finite();
const identityNumber = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const lootItemSchema = z.record(z.string(), z.unknown());

export const zoneSnapshotEntitySchema = z.object({
  spawnId: identityNumber,
  npcArchetypeId: identityNumber,
  lifecycle: z.enum(["alive", "corpse"]),
  position: z.object({
    x: finiteNumber,
    y: finiteNumber,
    z: finiteNumber,
  }),
  heading: finiteNumber,
  currentHp: z.number().int().nonnegative(),
  maximumHp: z.number().int().positive(),
  movement: z.object({
    targetIndex: z.number().int().nonnegative(),
    pauseRemainingMs: z.number().nonnegative().finite(),
  }).optional(),
  lootItems: z.array(lootItemSchema).optional(),
});

/** Versioned, transport-neutral persistent state for one zone instance. */
export const zoneSnapshotSchema = z.object({
  formatVersion: z.literal(ZONE_SNAPSHOT_FORMAT_VERSION),
  zoneId: identityNumber,
  instanceId: identityNumber,
  capturedAtMs: identityNumber,
  simulation: z.object({
    tick: identityNumber,
    elapsedMs: z.number().nonnegative().finite(),
  }),
  contentSignature: z.string(),
  entities: z.array(zoneSnapshotEntitySchema),
});

export type ZoneSnapshot = z.infer<typeof zoneSnapshotSchema>;
export type ZoneSnapshotEntity = z.infer<typeof zoneSnapshotEntitySchema>;

export interface ZoneSnapshotRestoreReport {
  readonly applied: number;
  readonly skippedUnknown: number;
  readonly skippedArchetype: number;
  readonly contentChanged: boolean;
}

export function encodeZoneSnapshot(snapshot: ZoneSnapshot): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(zoneSnapshotSchema.parse(snapshot)));
}

export function decodeZoneSnapshot(blob: Uint8Array): ZoneSnapshot {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(blob));
  } catch (error) {
    throw new Error("Zone snapshot blob is not valid JSON", { cause: error });
  }
  return zoneSnapshotSchema.parse(value);
}

export function captureZoneSnapshot(input: {
  readonly zoneId: number;
  readonly instanceId: number;
  readonly tick: number;
  readonly simulationTimeMs: number;
  readonly definitions: readonly ZoneNpcSpawnDefinition[];
  readonly entities: EntityStore;
  readonly movementRoutes: ReadonlyMap<number, MovementRoute>;
  readonly corpseLoot: CorpseLootSystem;
  readonly capturedAtMs?: number;
}): ZoneSnapshot {
  const definitions = new Map(input.definitions.map((definition) => [
    definition.spawnId,
    definition,
  ]));
  const entities: ZoneSnapshotEntity[] = [];
  for (let index = 0; index < input.entities.count; index++) {
    const entity = input.entities.at(index);
    if (
      !entity
      || (entity.kind !== EntityKind.npc && entity.kind !== EntityKind.corpse)
    ) continue;
    const definition = definitions.get(entity.id);
    if (!definition) continue;
    const route = input.movementRoutes.get(index);
    const lifecycle = entity.kind === EntityKind.corpse ? "corpse" : "alive";
    entities.push({
      spawnId: entity.id,
      npcArchetypeId: definition.npcArchetypeId,
      lifecycle,
      position: {
        x: entity.position.x,
        y: entity.position.y,
        z: entity.position.z,
      },
      heading: entity.heading,
      currentHp: entity.currentHp,
      maximumHp: Math.max(1, entity.maximumHp),
      ...(route
        ? {
            movement: {
              targetIndex: route.targetIndex,
              pauseRemainingMs: Math.max(
                0,
                route.pauseUntilMs - input.simulationTimeMs,
              ),
            },
          }
        : {}),
      ...(lifecycle === "corpse"
        ? { lootItems: input.corpseLoot.snapshotItems(entity.id) }
        : {}),
    });
  }
  entities.sort((left, right) => left.spawnId - right.spawnId);
  return zoneSnapshotSchema.parse({
    formatVersion: ZONE_SNAPSHOT_FORMAT_VERSION,
    zoneId: input.zoneId,
    instanceId: input.instanceId,
    capturedAtMs: Math.trunc(input.capturedAtMs ?? Date.now()),
    simulation: {
      tick: input.tick,
      elapsedMs: input.simulationTimeMs,
    },
    contentSignature: contentSignature(input.definitions),
    entities,
  });
}

/**
 * Restores only state that still matches current content. Newly added spawns
 * retain content defaults; removed or replaced spawns never prevent zone boot.
 */
export function restoreZoneSnapshot(
  snapshot: ZoneSnapshot,
  input: {
    readonly zoneId: number;
    readonly instanceId: number;
    readonly simulationTimeMs: number;
    readonly definitions: readonly ZoneNpcSpawnDefinition[];
    readonly entities: EntityStore;
    readonly movementRoutes: Map<number, MovementRoute>;
    readonly corpseLoot: CorpseLootSystem;
  },
): ZoneSnapshotRestoreReport {
  if (snapshot.zoneId !== input.zoneId || snapshot.instanceId !== input.instanceId) {
    throw new Error(
      `Zone snapshot identity ${snapshot.zoneId}:${snapshot.instanceId} does not match ${input.zoneId}:${input.instanceId}`,
    );
  }
  const definitions = new Map(input.definitions.map((definition) => [
    definition.spawnId,
    definition,
  ]));
  let applied = 0;
  let skippedUnknown = 0;
  let skippedArchetype = 0;
  for (const persisted of snapshot.entities) {
    const definition = definitions.get(persisted.spawnId);
    const entity = input.entities.get(persisted.spawnId);
    if (!definition || !entity) {
      skippedUnknown += 1;
      continue;
    }
    if (definition.npcArchetypeId !== persisted.npcArchetypeId) {
      skippedArchetype += 1;
      continue;
    }
    entity.position.set(
      persisted.position.x,
      persisted.position.y,
      persisted.position.z,
    );
    entity.heading = persisted.heading;
    entity.currentHp = Math.min(persisted.currentHp, entity.maximumHp);
    const route = input.movementRoutes.get(entity.index);
    if (route && persisted.movement) {
      route.targetIndex = Math.min(
        persisted.movement.targetIndex,
        Math.max(0, route.points.length - 1),
      );
      route.pauseUntilMs = persisted.movement.pauseRemainingMs > 0
        ? input.simulationTimeMs + persisted.movement.pauseRemainingMs
        : 0;
      const target = route.points[route.targetIndex];
      if (target) {
        entity.position.set(
          persisted.position.x,
          persisted.position.y,
          persisted.position.z,
        );
        if (entity instanceof NPC) entity.target.set(target.x, target.y, target.z);
      }
    }
    if (persisted.lifecycle === "corpse" && entity.kind === EntityKind.npc) {
      input.movementRoutes.delete(entity.index);
      input.corpseLoot.restoreCorpse(entity, persisted.lootItems ?? []);
    }
    entity.markDirty();
    applied += 1;
  }
  return {
    applied,
    skippedUnknown,
    skippedArchetype,
    contentChanged: snapshot.contentSignature !== contentSignature(input.definitions),
  };
}

export function contentSignature(
  definitions: readonly ZoneNpcSpawnDefinition[],
): string {
  return definitions
    .map((definition) => `${definition.spawnId}:${definition.npcArchetypeId}`)
    .sort()
    .join(",");
}
