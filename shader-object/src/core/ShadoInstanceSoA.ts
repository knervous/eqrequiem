export type ShadoWasmAllocator = {
  memory: WebAssembly.Memory;
  alloc: (bytes: number) => number;
};

/**
 * Hot, per-instance state which deliberately lives outside the durable actor
 * AoS. The three planes can be passed to WASM independently and the compact
 * visible-index plane can be uploaded without touching actor records.
 */
export class ShadoInstanceSoA {
  private capacityValue = 0;
  private countValue = 0;
  private visibleCountValue = 0;
  private versionValue = 0;
  private dirtyCountValue = 0;
  private dirtyMinValue = Number.MAX_SAFE_INTEGER;
  private dirtyMaxValue = -1;
  private publishedVisibleCount = 0;
  private publishedVisibleIndices = new Uint32Array(0);
  private hasPublishedVisibility = false;
  private wasm?: ShadoWasmAllocator;
  private wasmBuffer?: ArrayBuffer;
  private visibleIndicesPtrValue = 0;
  private visibilityPtrValue = 0;
  private dirtyPtrValue = 0;
  private cullingPtrValue = 0;
  private frustumPtrValue = 0;
  private visibleIndicesValue = new Uint32Array(0);
  private visibilityValue = new Uint8Array(0);
  private dirtyValue = new Uint8Array(0);
  private cullingValue = new Uint8Array(0);
  private frustumValue = new Float32Array(24);

  public get capacity(): number {
    return this.capacityValue;
  }
  public get count(): number {
    return this.countValue;
  }
  public get visibleCount(): number {
    return this.visibleCountValue;
  }
  public get version(): number {
    return this.versionValue;
  }
  public get hasDirtyActors(): boolean {
    return this.dirtyCountValue > 0;
  }
  public get dirtyActorBounds(): { start: number; end: number } | undefined {
    if (!this.dirtyCountValue) return undefined;
    return { start: this.dirtyMinValue, end: this.dirtyMaxValue + 1 };
  }
  public get visibleIndicesPtr(): number {
    this.refreshWasmViews();
    return this.visibleIndicesPtrValue;
  }
  public get visibilityPtr(): number {
    this.refreshWasmViews();
    return this.visibilityPtrValue;
  }
  public get dirtyPtr(): number {
    this.refreshWasmViews();
    return this.dirtyPtrValue;
  }
  public get cullingPtr(): number {
    this.refreshWasmViews();
    return this.cullingPtrValue;
  }
  public get frustumPtr(): number {
    this.refreshWasmViews();
    return this.frustumPtrValue;
  }
  public get frustumPlanes(): Float32Array {
    this.refreshWasmViews();
    return this.frustumValue;
  }

  public get visibleActorIndices(): Uint32Array {
    this.refreshWasmViews();
    return this.visibleIndicesValue.subarray(0, this.visibleCountValue);
  }

  public get visibilityFlags(): Uint8Array {
    this.refreshWasmViews();
    return this.visibilityValue.subarray(0, this.countValue);
  }

  public get dirtyFlags(): Uint8Array {
    this.refreshWasmViews();
    return this.dirtyValue.subarray(0, this.countValue);
  }

  /** Per-actor reason bits produced by coordinated world/render culling. */
  public get cullingFlags(): Uint8Array {
    this.refreshWasmViews();
    return this.cullingValue.subarray(0, this.countValue);
  }

  public attachWasm(wasm: ShadoWasmAllocator): void {
    if (this.wasm === wasm) return;
    const visible = this.visibleIndicesValue.slice(0, this.visibleCountValue);
    const visibility = this.visibilityValue.slice(0, this.countValue);
    const dirty = this.dirtyValue.slice(0, this.countValue);
    const culling = this.cullingValue.slice(0, this.countValue);
    this.wasm = wasm;
    this.frustumPtrValue = this.wasm.alloc(this.frustumValue.byteLength);
    this.wasmBuffer = this.wasm.memory.buffer;
    const frustum = this.frustumValue;
    this.frustumValue = new Float32Array(this.wasmBuffer, this.frustumPtrValue, 24);
    this.frustumValue.set(frustum);
    this.allocate(Math.max(4, this.capacityValue));
    this.visibleIndicesValue.set(visible);
    this.visibilityValue.set(visibility);
    this.dirtyValue.set(dirty);
    this.cullingValue.set(culling);
    this.recountDirty();
  }

  public ensureCapacity(count: number): void {
    // The owner's actor arena and these sidecars share one WebAssembly.Memory.
    // Repacking the actor arena may therefore detach these cached views even
    // when the sidecar already has enough logical capacity.
    this.refreshWasmViews();
    const nextCount = Math.max(0, count | 0);
    if (nextCount > this.capacityValue) {
      let capacity = Math.max(4, this.capacityValue);
      while (capacity < nextCount) capacity *= 2;
      this.allocate(capacity);
    }
    if (nextCount > this.countValue) {
      this.dirtyValue.fill(1, this.countValue, nextCount);
      this.dirtyCountValue += nextCount - this.countValue;
      this.dirtyMinValue = Math.min(this.dirtyMinValue, this.countValue);
      this.dirtyMaxValue = Math.max(this.dirtyMaxValue, nextCount - 1);
    }
    this.countValue = nextCount;
    this.visibleCountValue = Math.min(this.visibleCountValue, nextCount);
  }

  /** Reserve sidecar capacity without changing the logical actor count. */
  public reserve(count: number): void {
    this.refreshWasmViews();
    const required = Math.max(0, count | 0);
    if (required <= this.capacityValue) return;
    let capacity = Math.max(4, this.capacityValue);
    while (capacity < required) capacity *= 2;
    this.allocate(capacity);
  }

  public beginVisibilityPass(count = this.countValue): void {
    this.ensureCapacity(count);
    this.visibilityValue.fill(0, 0, this.countValue);
    this.visibleCountValue = 0;
  }

  public appendVisible(actorIndex: number): void {
    this.refreshWasmViews();
    const index = actorIndex | 0;
    if (index < 0 || index >= this.countValue) {
      throw new RangeError(`Visible actor index ${index} is outside 0..${this.countValue - 1}`);
    }
    this.visibleIndicesValue[this.visibleCountValue++] = index >>> 0;
    this.visibilityValue[index] = 1;
  }

  /** Call after a WASM pass has populated the planes. */
  public finishVisibilityPass(visibleCount: number): void {
    this.refreshWasmViews();
    const nextCount = Math.max(0, Math.min(this.countValue, visibleCount | 0));
    this.visibleCountValue = nextCount;
    let changed = !this.hasPublishedVisibility || nextCount !== this.publishedVisibleCount;
    if (!changed) {
      for (let i = 0; i < nextCount; i++) {
        if (this.visibleIndicesValue[i] !== this.publishedVisibleIndices[i]) {
          changed = true;
          break;
        }
      }
    }
    if (!changed) return;
    if (this.publishedVisibleIndices.length < nextCount) {
      let capacity = Math.max(4, this.publishedVisibleIndices.length);
      while (capacity < nextCount) capacity *= 2;
      this.publishedVisibleIndices = new Uint32Array(capacity);
    }
    this.publishedVisibleIndices.set(this.visibleIndicesValue.subarray(0, nextCount), 0);
    this.publishedVisibleCount = nextCount;
    this.hasPublishedVisibility = true;
    this.versionValue++;
  }

  /** Applies compact indices and diagnostic reason flags from an external reducer. */
  public applyVisibilityPass(
    visibleIndices: ArrayLike<number>,
    cullingFlags?: ArrayLike<number>
  ): void {
    this.refreshWasmViews();
    // Clear only the previously compacted set. External worker results should
    // make main-thread application scale with rendered membership, not arena
    // capacity.
    for (let i = 0; i < this.visibleCountValue; i++) {
      const index = this.visibleIndicesValue[i];
      if (index < this.countValue) this.visibilityValue[index] = 0;
    }
    const candidateCount = Math.min(this.countValue, visibleIndices.length);
    let visibleCount = 0;
    for (let i = 0; i < candidateCount; i++) {
      const index = Number(visibleIndices[i]) | 0;
      if (index < 0 || index >= this.countValue) continue;
      this.visibleIndicesValue[visibleCount++] = index >>> 0;
      this.visibilityValue[index] = 1;
    }
    if (cullingFlags) {
      this.cullingValue.fill(0, 0, this.countValue);
      const count = Math.min(this.countValue, cullingFlags.length);
      for (let i = 0; i < count; i++) this.cullingValue[i] = Number(cullingFlags[i]) & 0xff;
    }
    this.finishVisibilityPass(visibleCount);
  }

  public setDirty(index: number, dirty = true): void {
    this.refreshWasmViews();
    if (index < 0 || index >= this.countValue) return;
    const value = dirty ? 1 : 0;
    if (this.dirtyValue[index] === value) return;
    this.dirtyValue[index] = value;
    if (value) {
      this.dirtyCountValue++;
      this.dirtyMinValue = Math.min(this.dirtyMinValue, index);
      this.dirtyMaxValue = Math.max(this.dirtyMaxValue, index);
    } else {
      this.dirtyCountValue--;
      if (!this.dirtyCountValue) this.resetDirtyBounds();
    }
  }

  public setVisibility(index: number, visible: boolean): void {
    this.refreshWasmViews();
    if (index < 0 || index >= this.countValue) return;
    const value = visible ? 1 : 0;
    if (this.visibilityValue[index] === value) return;
    this.visibilityValue[index] = value;
    this.versionValue++;
  }

  public clearDirty(): void {
    this.refreshWasmViews();
    if (!this.dirtyCountValue) return;
    this.dirtyValue.fill(0, 0, this.countValue);
    this.dirtyCountValue = 0;
    this.resetDirtyBounds();
  }

  public removeSwap(index: number): void {
    this.refreshWasmViews();
    const last = this.countValue - 1;
    if (index < 0 || index > last) return;
    if (index !== last) {
      this.visibilityValue[index] = this.visibilityValue[last];
      this.setDirty(index, true);
      this.cullingValue[index] = this.cullingValue[last];
    }
    this.visibilityValue[last] = 0;
    this.setDirty(last, false);
    this.cullingValue[last] = 0;
    this.countValue = last;
    this.visibleCountValue = Math.min(this.visibleCountValue, last);
    this.versionValue++;
  }

  private allocate(capacity: number): void {
    this.refreshWasmViews();
    const oldVisible = this.visibleIndicesValue.slice(0, this.visibleCountValue);
    const oldVisibility = this.visibilityValue.slice(0, this.countValue);
    const oldDirty = this.dirtyValue.slice(0, this.countValue);
    const oldCulling = this.cullingValue.slice(0, this.countValue);
    this.capacityValue = capacity;

    if (this.wasm) {
      this.visibleIndicesPtrValue = this.wasm.alloc(capacity * Uint32Array.BYTES_PER_ELEMENT);
      this.visibilityPtrValue = this.wasm.alloc(capacity);
      this.dirtyPtrValue = this.wasm.alloc(capacity);
      this.cullingPtrValue = this.wasm.alloc(capacity);
      this.wasmBuffer = this.wasm.memory.buffer;
      this.visibleIndicesValue = new Uint32Array(
        this.wasmBuffer,
        this.visibleIndicesPtrValue,
        capacity
      );
      this.visibilityValue = new Uint8Array(this.wasmBuffer, this.visibilityPtrValue, capacity);
      this.dirtyValue = new Uint8Array(this.wasmBuffer, this.dirtyPtrValue, capacity);
      this.cullingValue = new Uint8Array(this.wasmBuffer, this.cullingPtrValue, capacity);
      this.frustumValue = new Float32Array(this.wasmBuffer, this.frustumPtrValue, 24);
    } else {
      this.visibleIndicesValue = new Uint32Array(capacity);
      this.visibilityValue = new Uint8Array(capacity);
      this.dirtyValue = new Uint8Array(capacity);
      this.cullingValue = new Uint8Array(capacity);
    }
    this.visibleIndicesValue.set(oldVisible);
    this.visibilityValue.set(oldVisibility);
    this.dirtyValue.set(oldDirty);
    this.cullingValue.set(oldCulling);
  }

  private resetDirtyBounds(): void {
    this.dirtyMinValue = Number.MAX_SAFE_INTEGER;
    this.dirtyMaxValue = -1;
  }

  private recountDirty(): void {
    this.dirtyCountValue = 0;
    this.resetDirtyBounds();
    for (let i = 0; i < this.countValue; i++) {
      if (!this.dirtyValue[i]) continue;
      this.dirtyCountValue++;
      this.dirtyMinValue = Math.min(this.dirtyMinValue, i);
      this.dirtyMaxValue = i;
    }
  }

  private refreshWasmViews(): void {
    if (!this.wasm || !this.capacityValue || this.wasmBuffer === this.wasm.memory.buffer) return;
    this.wasmBuffer = this.wasm.memory.buffer;
    this.visibleIndicesValue = new Uint32Array(
      this.wasmBuffer,
      this.visibleIndicesPtrValue,
      this.capacityValue
    );
    this.visibilityValue = new Uint8Array(
      this.wasmBuffer,
      this.visibilityPtrValue,
      this.capacityValue
    );
    this.dirtyValue = new Uint8Array(this.wasmBuffer, this.dirtyPtrValue, this.capacityValue);
    this.cullingValue = new Uint8Array(this.wasmBuffer, this.cullingPtrValue, this.capacityValue);
    this.frustumValue = new Float32Array(this.wasmBuffer, this.frustumPtrValue, 24);
  }
}
