import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { BackendCharacterCreate } from "./contracts.js";
import { resolveCharacterStats } from "./character-rules.js";
import { validEltaniaCharacterProjection } from "./eltania-character-adapter.js";

const character = (): BackendCharacterCreate => ({
  name                   : "Aelric",
  race                   : 1,
  charClass              : 1,
  gender                 : 0,
  deity                  : 207,
  startZone              : 1,
  face                   : 0,
  appearanceSchemaVersion: 1,
  bodyFamilyId           : "body-family:eltania-wayfarer-v1",
  bodyComponentId        : "body:eltania-wayfarer-a-v1",
  faceComponentId        : "face:eltania-wayfarer-01",
  presentationId         : "presentation:eltania-a",
  callingId              : "calling:eltania-vanguard-v1",
  originId               : "origin:elrador-test-world-v1",
});

describe("Eltania character adapter", () => {
  it("accepts the declared v1 composition and its numeric projection", () => {
    assert.equal(validEltaniaCharacterProjection(character()), true);
  });

  it("rejects stable IDs that do not match the numeric projection", () => {
    assert.equal(validEltaniaCharacterProjection({
      ...character(),
      face: 3,
    }), false);
    assert.equal(validEltaniaCharacterProjection({
      ...character(),
      originId: "origin:unknown",
    }), false);
  });

  it("keeps unversioned legacy requests available during migration", () => {
    const legacy = character();
    delete legacy.appearanceSchemaVersion;
    assert.equal(validEltaniaCharacterProjection(legacy), true);
  });

  it("accepts every model-backed player race projection", () => {
    const families = [
      ["barbarian", 2, "bam"], ["erudite", 3, "erm"],
      ["wood-elf", 4, "elm"], ["high-elf", 5, "him"],
      ["dark-elf", 6, "dam"], ["half-elf", 7, "ham"],
      ["dwarf", 8, "dwm"], ["troll", 9, "trm"],
      ["ogre", 10, "ogm"], ["halfling", 11, "hom"],
      ["gnome", 12, "gnm"], ["iksar", 128, "ikm"],
      ["vah-shir", 130, "kem"],
    ] as const;
    for (const [family, race, presentation] of families) {
      const projected = {
        ...character(),
        race,
        bodyFamilyId   : `body-family:${family}-v1`,
        bodyComponentId: `body:${family}-v1-male-v1`,
        faceComponentId: `face:${family}-v1-01`,
        presentationId : `presentation:${presentation}`,
      };
      assert.equal(validEltaniaCharacterProjection(projected), true, family);
      assert.notEqual(resolveCharacterStats(projected), null, family);
    }
  });

  it("rejects face IDs outside the authored range", () => {
    assert.equal(validEltaniaCharacterProjection({
      ...character(),
      face            : 8,
      faceComponentId : "face:eltania-wayfarer-09",
    }), false);
  });
});
