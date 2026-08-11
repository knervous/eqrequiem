import type { PersistCharacter } from "./types.js";

export function characterSelectProjection(
  characters: readonly PersistCharacter[],
) {
  const projected = characters.map((character) => ({
    name: character.name,
    level: character.level,
    charClass: character.class ?? 0,
    race: character.race ?? 0,
    gender: character.gender ?? 0,
    deity: character.deity ?? 0,
    zone: character.zoneId ?? 0,
    instance: character.zoneInstance ?? 0,
    lastLogin: character.lastLogin ?? 0,
    face: character.face ?? 0,
    enabled: 1,
    items: character.items ?? [],
    ...(character.appearanceSchemaVersion === undefined
      ? {}
      : {
          appearanceSchemaVersion: character.appearanceSchemaVersion,
          bodyFamilyId: character.bodyFamilyId,
          bodyComponentId: character.bodyComponentId,
          faceComponentId: character.faceComponentId,
          presentationId: character.presentationId,
          callingId: character.callingId,
          originId: character.originId,
        }),
  }));
  return { characterCount: projected.length, characters: projected };
}
