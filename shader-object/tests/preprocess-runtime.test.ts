import { describe, expect, it } from '@jest/globals';
import { gzipSync } from 'node:zlib';

import { fetchShadoBytes } from '../src/preprocess/runtime';

const payload = new TextEncoder().encode('{"kind":"shado.model"}');

function fetcher(bytes: Uint8Array): typeof fetch {
  return (async () => new Response(bytes)) as typeof fetch;
}

describe('preprocess runtime artifact loading', () => {
  it('decompresses opaque gzip artifacts', async () => {
    const compressed = gzipSync(payload);
    const bytes = await fetchShadoBytes('/model.json.gz', { fetch: fetcher(compressed) });

    expect(new Uint8Array(bytes)).toEqual(payload);
  });

  it('accepts gzip URLs already decoded by the browser', async () => {
    const bytes = await fetchShadoBytes('/model.json.gz', { fetch: fetcher(payload) });

    expect(new Uint8Array(bytes)).toEqual(payload);
  });
});
