import { ShadoInstanceSoA } from '../src/core/ShadoInstanceSoA';

describe('ShadoInstanceSoA', () => {
  it('keeps compact draw indices, visibility, and dirty bytes in separate planes', () => {
    const soa = new ShadoInstanceSoA();
    soa.beginVisibilityPass(20_000);
    soa.appendVisible(2);
    soa.appendVisible(19_999);
    soa.finishVisibilityPass(2);

    expect(Array.from(soa.visibleActorIndices)).toEqual([2, 19_999]);
    expect(soa.visibilityFlags.byteLength).toBe(20_000);
    expect(soa.visibilityFlags[2]).toBe(1);
    expect(soa.visibilityFlags[3]).toBe(0);
    expect(soa.dirtyFlags.byteLength).toBe(20_000);
    expect(soa.cullingFlags.byteLength).toBe(20_000);
  });

  it('accepts compact coordinated visibility output and reason flags', () => {
    const soa = new ShadoInstanceSoA();
    soa.ensureCapacity(4);
    soa.applyVisibilityPass(Uint32Array.from([1, 3]), Uint8Array.from([1, 15, 0, 15]));

    expect(Array.from(soa.visibleActorIndices)).toEqual([1, 3]);
    expect(Array.from(soa.visibilityFlags)).toEqual([0, 1, 0, 1]);
    expect(Array.from(soa.cullingFlags)).toEqual([1, 15, 0, 15]);
  });

  it('supports a one-byte dirty flag for each actor', () => {
    const soa = new ShadoInstanceSoA();
    soa.ensureCapacity(10_000);
    expect(soa.dirtyFlags.every(value => value === 1)).toBe(true);

    soa.clearDirty();
    soa.setDirty(9_999);
    expect(soa.dirtyFlags.reduce((sum, value) => sum + value, 0)).toBe(1);
  });

  it('versions direct visibility changes for a separate GPU upload pass', () => {
    const soa = new ShadoInstanceSoA();
    soa.ensureCapacity(2);
    const before = soa.version;
    soa.setVisibility(1, true);
    expect(soa.visibilityFlags[1]).toBe(1);
    expect(soa.version).toBe(before + 1);
  });

  it('does not version an unchanged compact visibility result', () => {
    const soa = new ShadoInstanceSoA();
    soa.ensureCapacity(4);
    soa.applyVisibilityPass(Uint32Array.from([1, 3]));
    const version = soa.version;
    soa.applyVisibilityPass(Uint32Array.from([1, 3]));
    expect(soa.version).toBe(version);
  });

  it('clears only prior compact membership when applying worker results', () => {
    const soa = new ShadoInstanceSoA();
    soa.ensureCapacity(100_000);
    soa.applyVisibilityPass(Uint32Array.from([1, 99_999]));
    soa.applyVisibilityPass(Uint32Array.from([2]));

    expect(Array.from(soa.visibleActorIndices)).toEqual([2]);
    expect(soa.visibilityFlags[1]).toBe(0);
    expect(soa.visibilityFlags[2]).toBe(1);
    expect(soa.visibilityFlags[99_999]).toBe(0);
  });

  it('can expose all planes directly to a WASM allocator', () => {
    const memory = new WebAssembly.Memory({ initial: 2 });
    let cursor = 64;
    const soa = new ShadoInstanceSoA();
    soa.attachWasm({
      memory,
      alloc(bytes) {
        const ptr = cursor;
        cursor = (cursor + bytes + 7) & ~7;
        return ptr;
      },
    });
    soa.ensureCapacity(128);

    new Uint8Array(memory.buffer, soa.dirtyPtr, 128)[7] = 1;
    new Uint32Array(memory.buffer, soa.visibleIndicesPtr, 1)[0] = 42;
    new Uint8Array(memory.buffer, soa.visibilityPtr, 128)[42] = 1;
    soa.finishVisibilityPass(1);

    expect(soa.dirtyFlags[7]).toBe(1);
    expect(soa.visibleActorIndices[0]).toBe(42);
    expect(soa.visibilityFlags[42]).toBe(1);
  });

  it('refreshes every view when reserved WASM sidecars grow memory', () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    let cursor = 64;
    const soa = new ShadoInstanceSoA();
    soa.attachWasm({
      memory,
      alloc(bytes) {
        const ptr = cursor;
        cursor = (cursor + bytes + 7) & ~7;
        const missing = cursor - memory.buffer.byteLength;
        if (missing > 0) memory.grow(Math.ceil(missing / 65_536));
        return ptr;
      },
    });
    soa.reserve(50_000);
    soa.ensureCapacity(50_000);
    soa.beginVisibilityPass();
    soa.appendVisible(49_999);
    soa.finishVisibilityPass(1);

    expect(soa.capacity).toBeGreaterThanOrEqual(50_000);
    expect(soa.visibleActorIndices[0]).toBe(49_999);
    expect(soa.visibilityFlags[49_999]).toBe(1);
    expect(soa.frustumPlanes.buffer).toBe(memory.buffer);
  });
});
