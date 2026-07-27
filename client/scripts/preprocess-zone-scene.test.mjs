import assert from "node:assert/strict";
import test from "node:test";

import { preprocessZoneSceneGlb } from "./promote-zone-object-assets.mjs";

function buildGlb() {
  const binary = Buffer.alloc(128);
  const positions = new Float32Array(binary.buffer, binary.byteOffset, 9);
  positions.set([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const normals = new Float32Array(binary.buffer, binary.byteOffset + 36, 9);
  normals.set([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const tangents = new Float32Array(binary.buffer, binary.byteOffset + 72, 12);
  tangents.set([1, 0, 0, 1, 0, 1, 0, -1, 0, 0, 1, 1]);
  const indices = new Uint16Array(binary.buffer, binary.byteOffset + 120, 3);
  indices.set([0, 1, 2]);
  const document = {
    asset: { version: "2.0" },
    buffers: [{ byteLength: 126 }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 36 },
      { buffer: 0, byteOffset: 72, byteLength: 48 },
      { buffer: 0, byteOffset: 120, byteLength: 6 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: "VEC3",
        min: [1, 2, 3],
        max: [7, 8, 9],
      },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 2, componentType: 5126, count: 3, type: "VEC4" },
      { bufferView: 3, componentType: 5123, count: 3, type: "SCALAR" },
    ],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1, TANGENT: 2 },
            indices: 3,
          },
        ],
      },
    ],
    nodes: [{ mesh: 0 }, { children: [0], scale: [-1, 1, 1] }],
    scenes: [{ nodes: [1] }],
    scene: 0,
  };
  const json = Buffer.from(JSON.stringify(document));
  const paddedJsonLength = (json.length + 3) & ~3;
  const output = Buffer.alloc(12 + 8 + paddedJsonLength + 8 + binary.length);
  output.write("glTF", 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(paddedJsonLength, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  output.fill(0x20, 20, 20 + paddedJsonLength);
  json.copy(output, 20);
  const binaryHeader = 20 + paddedJsonLength;
  output.writeUInt32LE(binary.length, binaryHeader);
  output.writeUInt32LE(0x004e4942, binaryHeader + 4);
  binary.copy(output, binaryHeader + 8);
  return output;
}

function parseGlb(bytes) {
  const jsonLength = bytes.readUInt32LE(12);
  const document = JSON.parse(
    bytes.subarray(20, 20 + jsonLength).toString("utf8").trimEnd(),
  );
  const binaryHeader = 20 + jsonLength;
  return {
    document,
    binary: bytes.subarray(binaryHeader + 8),
  };
}

test("bakes canonical zone X reflection with corrected surface orientation", () => {
  const result = parseGlb(preprocessZoneSceneGlb(buildGlb(), "fixture"));
  assert.deepEqual(
    Array.from(
      new Float32Array(
        result.binary.buffer,
        result.binary.byteOffset,
        9,
      ),
    ),
    [-1, 2, 3, -4, 5, 6, -7, 8, 9],
  );
  assert.deepEqual(
    Array.from(
      new Float32Array(
        result.binary.buffer,
        result.binary.byteOffset + 36,
        9,
      ),
    ),
    [-1, 0, 0, -0, 1, 0, -0, 0, 1],
  );
  assert.deepEqual(
    Array.from(
      new Float32Array(
        result.binary.buffer,
        result.binary.byteOffset + 72,
        12,
      ),
    ),
    [-1, 0, 0, -1, -0, 1, 0, 1, -0, 0, 1, -1],
  );
  assert.deepEqual(
    Array.from(
      new Uint16Array(
        result.binary.buffer,
        result.binary.byteOffset + 120,
        3,
      ),
    ),
    [0, 2, 1],
  );
  assert.deepEqual(result.document.accessors[0].min, [-7, 2, 3]);
  assert.deepEqual(result.document.accessors[0].max, [-1, 8, 9]);
  assert.equal(result.document.nodes[1].scale, undefined);
  assert.equal(
    result.document.asset.extras.requiemRuntimeContract,
    "babylon-rhs-y-up-v4",
  );
  assert.equal(
    result.document.asset.extras.canonicalZoneMirrorXApplied,
    true,
  );
});
