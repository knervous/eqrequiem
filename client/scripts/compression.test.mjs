import assert from 'node:assert/strict';
import test from 'node:test';
import { gzipSync } from 'node:zlib';

import { maybeDecompressGzip } from '../src/Core/compression.ts';

function exactArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

test('maybeDecompressGzip decodes a gzip payload', () => {
  const source = new TextEncoder().encode('{"meshes":[{"name":"hum"}]}');
  const compressed = exactArrayBuffer(gzipSync(source));
  const decoded = new Uint8Array(maybeDecompressGzip(compressed));
  assert.deepEqual(decoded, source);
});

test('maybeDecompressGzip preserves an uncompressed payload', () => {
  const source = exactArrayBuffer(new Uint8Array([1, 2, 3, 4]));
  assert.equal(maybeDecompressGzip(source), source);
});
