import type { BackendCharacterCreate } from "./contracts.js";

const BODY_FAMILY_ID = "body-family:eltania-wayfarer-v1";
const CALLING_ID = "calling:eltania-vanguard-v1";
const ORIGIN_ID = "origin:elrador-test-world-v1";
const BODY_COMPONENTS = [
  ["body:eltania-wayfarer-a-v1", "presentation:eltania-a"],
  ["body:eltania-wayfarer-b-v1", "presentation:eltania-b"],
] as const;
const FACE_COMPONENTS = [
  "face:eltania-wayfarer-01",
  "face:eltania-wayfarer-02",
  "face:eltania-wayfarer-03",
  "face:eltania-wayfarer-04",
] as const;

/**
 * Checks the temporary bridge between the first original composition contract
 * and the numeric transport/content seam. Unversioned legacy requests remain
 * supported until existing characters and content have been migrated.
 */
export function validEltaniaCharacterProjection(
  character: BackendCharacterCreate,
): boolean {
  if (character.appearanceSchemaVersion === undefined) return true;
  if (
    character.appearanceSchemaVersion !== 1 ||
    character.bodyFamilyId !== BODY_FAMILY_ID ||
    character.callingId !== CALLING_ID ||
    character.originId !== ORIGIN_ID ||
    character.race !== 1 ||
    character.charClass !== 1 ||
    character.deity !== 207 ||
    character.startZone !== 1
  ) return false;

  const bodyIndex = BODY_COMPONENTS.findIndex(
    ([bodyId, presentationId]) =>
      bodyId === character.bodyComponentId &&
      presentationId === character.presentationId,
  );
  const faceIndex = FACE_COMPONENTS.indexOf(
    character.faceComponentId as typeof FACE_COMPONENTS[number],
  );
  return bodyIndex === character.gender && faceIndex === character.face;
}

export function readEltaniaCharacterContractFields(
  value: Readonly<Record<string, unknown>>,
): Partial<BackendCharacterCreate> {
  const fields: Partial<BackendCharacterCreate> = {};
  const schemaVersion = Number(value.appearanceSchemaVersion);
  if (
    value.appearanceSchemaVersion !== undefined &&
    Number.isFinite(schemaVersion)
  ) fields.appearanceSchemaVersion = schemaVersion;
  for (const key of [
    "bodyFamilyId",
    "bodyComponentId",
    "faceComponentId",
    "presentationId",
    "callingId",
    "originId",
  ] as const) {
    const field = value[key];
    if (typeof field === "string" && field.length > 0) fields[key] = field;
  }
  return fields;
}
