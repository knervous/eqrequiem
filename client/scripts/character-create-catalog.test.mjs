import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  defaultEltaniaCharacterDraft,
  eltaniaCharacterContract,
  projectEltaniaCharacterToLegacyTransport,
} from '../src/Game/Content/eltania-character-contract.ts';

const EXPECTED_PLAYABLE_RACES = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 128, 130,
];

describe('character-create playable race catalog', () => {
  it('contains every model-backed PC race exactly once', () => {
    const races = eltaniaCharacterContract.bodyFamilies.map(
      (family) => family.race,
    );
    assert.deepEqual(races, EXPECTED_PLAYABLE_RACES);
    assert.equal(new Set(races).size, races.length);
  });

  it('projects every race, gender, and face through the stable contract', () => {
    for (const family of eltaniaCharacterContract.bodyFamilies) {
      assert.deepEqual(
        family.components.map((component) => component.gender),
        [0, 1],
        family.label,
      );
      assert.equal(family.faces.length, 8, family.label);

      for (const component of family.components) {
        const draft = {
          ...defaultEltaniaCharacterDraft(),
          bodyFamilyId   : family.id,
          bodyComponentId: component.id,
          faceComponentId: family.faces[7].id,
          presentationId : component.presentationId,
        };
        const projected = projectEltaniaCharacterToLegacyTransport(draft);
        assert.equal(projected.race, family.race, family.label);
        assert.equal(projected.gender, component.gender, family.label);
        assert.equal(projected.face, 7, family.label);
        assert.equal(projected.bodyFamilyId, family.id, family.label);
      }
    }
  });

  it('rejects components mixed between body families', () => {
    const draft = defaultEltaniaCharacterDraft();
    const otherFamily = eltaniaCharacterContract.bodyFamilies[1];
    assert.throws(() => projectEltaniaCharacterToLegacyTransport({
      ...draft,
      bodyFamilyId: otherFamily.id,
    }));
  });
});
