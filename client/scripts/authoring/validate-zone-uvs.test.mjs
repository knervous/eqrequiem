import assert from "node:assert/strict";
import test from "node:test";

import { auditZoneUvDocument } from "./validate-zone-uvs.mjs";

function fixture(uvs, { textured = true, includeUvs = true } = {}) {
  const values = new Map([
    [0, [[0, 0, 0], [1, 0, 0], [0, 1, 0]]],
    [1, uvs],
    [2, [[0], [1], [2]]],
  ]);
  return {
    document: {
      json: {
        accessors: [{ count: 3 }, { count: 3 }, { count: 3 }],
        materials: [
          textured
            ? { name: "surface", pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }
            : { name: "factor-only", pbrMetallicRoughness: {} },
        ],
        meshes: [
          {
            name: "mesh",
            primitives: [
              {
                attributes: { POSITION: 0, ...(includeUvs ? { TEXCOORD_0: 1 } : {}) },
                indices: 2,
                material: 0,
              },
            ],
          },
        ],
      },
      binary: Buffer.alloc(0),
    },
    readAccessor: (_, index) => values.get(index),
  };
}

test("mandatory zone UV pass accepts readable textured triangles", () => {
  const { document, readAccessor } = fixture([[0, 0], [1, 0], [0, 1]]);
  const report = auditZoneUvDocument(document, { readAccessor });
  assert.equal(report.status, "pass");
  assert.equal(report.auditedTriangleFaces, 1);
});

test("mandatory zone UV pass rejects missing texture coordinates", () => {
  const { document, readAccessor } = fixture([[0, 0], [1, 0], [0, 1]], {
    includeUvs: false,
  });
  const report = auditZoneUvDocument(document, { readAccessor });
  assert.equal(report.status, "fail");
  assert.match(report.failures[0], /missing TEXCOORD_0/);
});

test("mandatory zone UV pass rejects fixed-point collapsed faces", () => {
  const { document, readAccessor } = fixture([
    [0.25, 0.25],
    [0.2502, 0.25],
    [0.25, 0.2503],
  ]);
  const report = auditZoneUvDocument(document, { readAccessor });
  assert.equal(report.status, "fail");
  assert.match(report.failures[0], /collapsed TEXCOORD_0/);
});
