import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { BackendCharacterCreate } from "./contracts.js";
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
});
