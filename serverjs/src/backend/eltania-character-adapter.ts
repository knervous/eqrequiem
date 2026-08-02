import type { BackendCharacterCreate } from "./contracts.js";

const CALLING_ID = "calling:eltania-vanguard-v1";
const ORIGIN_ID = "origin:elrador-test-world-v1";
type BodyFamilyProjection = {
  race: number;
  components: readonly (readonly [string, string])[];
  facePrefix: string;
};

const legacyFamily = (
  family: string,
  race: number,
  maleModel: string,
  femaleModel: string,
): readonly [string, BodyFamilyProjection] => [
  `body-family:${family}-v1`,
  {
    race,
    components: [
      [`body:${family}-v1-male-v1`, `presentation:${maleModel}`],
      [`body:${family}-v1-female-v1`, `presentation:${femaleModel}`],
    ],
    facePrefix: `face:${family}-v1-`,
  },
];

const BODY_FAMILIES = new Map<string, BodyFamilyProjection>([
  [
    "body-family:eltania-wayfarer-v1",
    {
      race      : 1,
      components: [
        ["body:eltania-wayfarer-a-v1", "presentation:eltania-a"],
        ["body:eltania-wayfarer-b-v1", "presentation:eltania-b"],
      ],
      facePrefix: "face:eltania-wayfarer-",
    },
  ],
  legacyFamily("barbarian", 2, "bam", "baf"),
  legacyFamily("erudite", 3, "erm", "erf"),
  legacyFamily("wood-elf", 4, "elm", "elf"),
  legacyFamily("high-elf", 5, "him", "hif"),
  legacyFamily("dark-elf", 6, "dam", "daf"),
  legacyFamily("half-elf", 7, "ham", "haf"),
  legacyFamily("dwarf", 8, "dwm", "dwf"),
  legacyFamily("troll", 9, "trm", "trf"),
  legacyFamily("ogre", 10, "ogm", "ogf"),
  legacyFamily("halfling", 11, "hom", "hof"),
  legacyFamily("gnome", 12, "gnm", "gnf"),
  legacyFamily("iksar", 128, "ikm", "ikf"),
  legacyFamily("vah-shir", 130, "kem", "kef"),
]);

/**
 * Checks the temporary bridge between the first original composition contract
 * and the numeric transport/content seam. Unversioned legacy requests remain
 * supported until existing characters and content have been migrated.
 */
export function validEltaniaCharacterProjection(
  character: BackendCharacterCreate,
): boolean {
  if (character.appearanceSchemaVersion === undefined) return true;
  const bodyFamily = BODY_FAMILIES.get(character.bodyFamilyId ?? "");
  if (
    character.appearanceSchemaVersion !== 1 ||
    !bodyFamily ||
    character.callingId !== CALLING_ID ||
    character.originId !== ORIGIN_ID ||
    character.race !== bodyFamily.race ||
    character.charClass !== 1 ||
    character.deity !== 207 ||
    character.startZone !== 1
  ) return false;

  const bodyIndex = bodyFamily.components.findIndex(
    ([bodyId, presentationId]) =>
      bodyId === character.bodyComponentId &&
      presentationId === character.presentationId,
  );
  const faceComponent = character.faceComponentId ?? "";
  const faceIndex = faceComponent.startsWith(bodyFamily.facePrefix)
    ? Number(faceComponent.slice(bodyFamily.facePrefix.length)) - 1
    : -1;
  return bodyIndex >= 0 &&
    faceIndex >= 0 &&
    faceIndex < 8 &&
    Number.isInteger(faceIndex) &&
    bodyIndex === character.gender &&
    faceIndex === character.face;
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
