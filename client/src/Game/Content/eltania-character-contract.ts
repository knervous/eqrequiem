import type { CharCreate } from '@game/Net/messages';

export const ELTANIA_CHARACTER_SCHEMA_VERSION = 1;

export type EltaniaCharacterDraft = {
  name: string;
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

export const eltaniaCharacterContract = {
  schemaVersion: ELTANIA_CHARACTER_SCHEMA_VERSION,
  bodyFamilies: [
    {
      id: 'body-family:eltania-wayfarer-v1',
      label: 'Wayfarer',
      description:
        'The first modular Elrador player body family. Additional peoples will arrive as authored assets, not renamed legacy races.',
      components: [
        {
          id: 'body:eltania-wayfarer-a-v1',
          label: 'Body A',
          presentationId: 'presentation:eltania-a',
        },
        {
          id: 'body:eltania-wayfarer-b-v1',
          label: 'Body B',
          presentationId: 'presentation:eltania-b',
        },
      ],
      faces: [
        { id: 'face:eltania-wayfarer-01', label: 'Aspect I' },
        { id: 'face:eltania-wayfarer-02', label: 'Aspect II' },
        { id: 'face:eltania-wayfarer-03', label: 'Aspect III' },
        { id: 'face:eltania-wayfarer-04', label: 'Aspect IV' },
      ],
    },
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
    race    : 1,
    charClass: 1,
    gender  : 0,
    deity   : 207,
    startZone: 1,
    face    : 0,
  },
};

export const defaultEltaniaCharacterDraft = (): EltaniaCharacterDraft => ({
  name           : '',
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
  const bodyIndex = eltaniaCharacterContract.bodyFamilies[0].components.findIndex(
    (component) => component.id === draft.bodyComponentId,
  );
  const faceIndex = eltaniaCharacterContract.bodyFamilies[0].faces.findIndex(
    (face) => face.id === draft.faceComponentId,
  );
  if (
    !projection ||
    bodyIndex < 0 ||
    faceIndex < 0 ||
    draft.callingId !== eltaniaCharacterContract.callings[0].id
  ) {
    throw new Error('Unsupported Eltania character composition');
  }
  return {
    ...projection,
    name                   : draft.name,
    gender                 : bodyIndex,
    face                   : faceIndex,
    appearanceSchemaVersion: ELTANIA_CHARACTER_SCHEMA_VERSION,
    bodyFamilyId           : eltaniaCharacterContract.bodyFamilies[0].id,
    bodyComponentId        : draft.bodyComponentId,
    faceComponentId        : draft.faceComponentId,
    presentationId         : draft.presentationId,
    callingId              : draft.callingId,
    originId               : draft.originId,
  };
}

export const isValidEltaniaCharacterName = (name: string): boolean =>
  /^[A-Z][a-z]{3,14}$/.test(name.trim());
