import type { CharCreate } from '@game/Net/messages';

export const ELTANIA_CHARACTER_SCHEMA_VERSION = 1;

export type EltaniaCharacterDraft = {
  name: string;
  bodyFamilyId: string;
  bodyComponentId: string;
  faceComponentId: string;
  presentationId: string;
  callingId: string;
  originId: string;
};

type LegacyTransportProjection = {
  race: number;
  charClass: number;
  gender: number;
  deity: number;
  startZone: number;
  face: number;
};

const playableFaces = (family: string) =>
  Array.from({ length: 8 }, (_, index) => ({
    id   : `face:${family}-${String(index + 1).padStart(2, '0')}`,
    label: `Aspect ${String(index + 1).padStart(2, '0')}`,
  }));

const legacyBodyFamily = (
  id: string,
  label: string,
  race: number,
  maleModel: string,
  femaleModel: string,
) => ({
  id,
  label,
  race,
  components: [
    {
      id            : `body:${id.replace('body-family:', '')}-male-v1`,
      label         : 'Male',
      gender        : 0,
      presentationId: `presentation:${maleModel}`,
    },
    {
      id            : `body:${id.replace('body-family:', '')}-female-v1`,
      label         : 'Female',
      gender        : 1,
      presentationId: `presentation:${femaleModel}`,
    },
  ],
  faces: playableFaces(id.replace('body-family:', '')),
});

const humanBodyFamily = {
  id   : 'body-family:eltania-wayfarer-v1',
  label: 'Human',
  race : 1,
  components: [
    {
      id            : 'body:eltania-wayfarer-a-v1',
      label         : 'Male',
      gender        : 0,
      presentationId: 'presentation:eltania-a',
    },
    {
      id            : 'body:eltania-wayfarer-b-v1',
      label         : 'Female',
      gender        : 1,
      presentationId: 'presentation:eltania-b',
    },
  ],
  // Preserve the original four stable face IDs for existing characters.
  faces: [
    { id: 'face:eltania-wayfarer-01', label: 'Aspect 01' },
    { id: 'face:eltania-wayfarer-02', label: 'Aspect 02' },
    { id: 'face:eltania-wayfarer-03', label: 'Aspect 03' },
    { id: 'face:eltania-wayfarer-04', label: 'Aspect 04' },
    { id: 'face:eltania-wayfarer-05', label: 'Aspect 05' },
    { id: 'face:eltania-wayfarer-06', label: 'Aspect 06' },
    { id: 'face:eltania-wayfarer-07', label: 'Aspect 07' },
    { id: 'face:eltania-wayfarer-08', label: 'Aspect 08' },
  ],
};

export const eltaniaCharacterContract = {
  schemaVersion: ELTANIA_CHARACTER_SCHEMA_VERSION,
  bodyFamilies: [
    humanBodyFamily,
    legacyBodyFamily('body-family:barbarian-v1', 'Barbarian', 2, 'bam', 'baf'),
    legacyBodyFamily('body-family:erudite-v1', 'Erudite', 3, 'erm', 'erf'),
    legacyBodyFamily('body-family:wood-elf-v1', 'Wood Elf', 4, 'elm', 'elf'),
    legacyBodyFamily('body-family:high-elf-v1', 'High Elf', 5, 'him', 'hif'),
    legacyBodyFamily('body-family:dark-elf-v1', 'Dark Elf', 6, 'dam', 'daf'),
    legacyBodyFamily('body-family:half-elf-v1', 'Half Elf', 7, 'ham', 'haf'),
    legacyBodyFamily('body-family:dwarf-v1', 'Dwarf', 8, 'dwm', 'dwf'),
    legacyBodyFamily('body-family:troll-v1', 'Troll', 9, 'trm', 'trf'),
    legacyBodyFamily('body-family:ogre-v1', 'Ogre', 10, 'ogm', 'ogf'),
    legacyBodyFamily('body-family:halfling-v1', 'Halfling', 11, 'hom', 'hof'),
    legacyBodyFamily('body-family:gnome-v1', 'Gnome', 12, 'gnm', 'gnf'),
    legacyBodyFamily('body-family:iksar-v1', 'Iksar', 128, 'ikm', 'ikf'),
    legacyBodyFamily('body-family:vah-shir-v1', 'Vah Shir', 130, 'kem', 'kef'),
  ],
  callings: [
    {
      id: 'calling:eltania-vanguard-v1',
      label: 'Vanguard',
      description:
        'A deliberate close-range calling built around position, endurance, and protecting allies.',
    },
  ],
  origins: [
    {
      id: 'origin:elrador-test-world-v1',
      label: 'Elrador',
      status: 'Test-world adapter',
      description:
        'Begins in the current test world while the first original Elrador zone package is authored.',
    },
  ],
} as const;

const legacyProjectionByOrigin: Readonly<Record<string, LegacyTransportProjection>> = {
  'origin:elrador-test-world-v1': {
    charClass: 1,
    deity   : 207,
    startZone: 1,
    race    : 1,
    gender  : 0,
    face    : 0,
  },
};

export const defaultEltaniaCharacterDraft = (): EltaniaCharacterDraft => ({
  name           : '',
  bodyFamilyId   : eltaniaCharacterContract.bodyFamilies[0].id,
  bodyComponentId: eltaniaCharacterContract.bodyFamilies[0].components[0].id,
  faceComponentId: eltaniaCharacterContract.bodyFamilies[0].faces[0].id,
  presentationId : eltaniaCharacterContract.bodyFamilies[0].components[0].presentationId,
  callingId      : eltaniaCharacterContract.callings[0].id,
  originId       : eltaniaCharacterContract.origins[0].id,
});

export function projectEltaniaCharacterToLegacyTransport(
  draft: EltaniaCharacterDraft,
): CharCreate {
  const projection = legacyProjectionByOrigin[draft.originId];
  const bodyFamily = eltaniaCharacterContract.bodyFamilies.find(
    (family) => family.id === draft.bodyFamilyId,
  );
  const bodyIndex = bodyFamily?.components.findIndex(
    (component) => component.id === draft.bodyComponentId,
  ) ?? -1;
  const faceIndex = bodyFamily?.faces.findIndex(
    (face) => face.id === draft.faceComponentId,
  ) ?? -1;
  const bodyComponent = bodyFamily?.components[bodyIndex];
  if (
    !projection ||
    !bodyFamily ||
    !bodyComponent ||
    bodyIndex < 0 ||
    faceIndex < 0 ||
    draft.presentationId !== bodyComponent.presentationId ||
    draft.callingId !== eltaniaCharacterContract.callings[0].id
  ) {
    throw new Error('Unsupported Eltania character composition');
  }
  return {
    ...projection,
    name                   : draft.name,
    race                   : bodyFamily.race,
    gender                 : bodyComponent.gender,
    face                   : faceIndex,
    appearanceSchemaVersion: ELTANIA_CHARACTER_SCHEMA_VERSION,
    bodyFamilyId           : bodyFamily.id,
    bodyComponentId        : draft.bodyComponentId,
    faceComponentId        : draft.faceComponentId,
    presentationId         : draft.presentationId,
    callingId              : draft.callingId,
    originId               : draft.originId,
  };
}

export const isValidEltaniaCharacterName = (name: string): boolean =>
  /^[A-Z][a-z]{3,14}$/.test(name.trim());
