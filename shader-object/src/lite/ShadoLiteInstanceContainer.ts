import { Shado } from '../core/Shado';
import { ShadoInstanceSoA } from '../core/ShadoInstanceSoA';
import { field, gpuStruct, type PendingField } from '../decorators';
import type { ShadoActor } from '../extensions/ShadoActor';
import type { InitializeConfig } from '../types';

/**
 * Renderer-neutral packed actor collection for Babylon Lite.
 *
 * Model loading, atlas construction, and VAT baking deliberately do not live in
 * this class: downstream applications can gate those features independently.
 * The hot runtime stays storage-only and has no Babylon.js class dependency.
 */
@gpuStruct({ name: 'ShadoLiteInstanceContainer' })
export class ShadoLiteInstanceContainer<T extends ShadoActor = ShadoActor> extends Shado {
  @field('u32') declare visibleCount: number;
  @field('u32') declare instancesCount: number;
  @field({ arrayOf: 'vec4' }) declare cameraFrustum: Float32Array;

  private readonly actors: T[] = [];
  private readonly instanceSoA = new ShadoInstanceSoA();

  public static override async initialize(
    engine: any,
    config: InitializeConfig = {}
  ): Promise<boolean> {
    const actor = config.extra as any;
    if (!actor?.getSchema) {
      throw new Error(
        'ShadoLiteInstanceContainer.initialize requires config.extra to be a ShadoActor class.'
      );
    }
    const additionalFields: PendingField[] = [
      ...(config.additionalFields ?? []).filter(field => field.name !== 'instances'),
      { name: 'instances', type: { arrayOf: { structOf: actor } } },
    ];
    delete (this as any).__cachedSchema;
    return super.initialize(engine, {
      ...config,
      backend: 'storage',
      wasm: config.wasm ?? false,
      additionalFields,
    });
  }

  public constructor(engine: any) {
    super(engine);
    this.visibleCount = 0;
    this.instancesCount = 0;
  }

  public get children(): readonly T[] {
    return this.actors;
  }

  public get instanceCount(): number {
    return this.actors.length;
  }

  public override getVisibleCount(): number {
    return this.instanceSoA.visibleCount;
  }

  public get visibleActorIndices(): Uint32Array {
    return this.instanceSoA.visibleActorIndices;
  }

  public get visibilityVersion(): number {
    return this.instanceSoA.version;
  }

  public getVisibilityFlag(index: number): number {
    return this.instanceSoA.visibilityFlags[index] ?? 0;
  }

  public setVisibilityFlag(index: number, visible: boolean): void {
    this.instanceSoA.setVisibility(index, visible);
  }

  public reserveInstances(count: number): void {
    const required = Math.max(0, count | 0);
    this.reserveStructArray('instances', required);
    this.instanceSoA.reserve(required);
    this._refreshViewsIfGrown();
  }

  public addInstance(suppressVisibilityRebuild = false): T {
    const actor = this.addStructToArray<T>('instances');
    actor.initialize();
    this.actors.push(actor);
    this.instancesCount = this.actors.length;
    this.instanceSoA.ensureCapacity(this.actors.length);
    this._refreshViewsIfGrown();
    if (!suppressVisibilityRebuild) this.showAll();
    return actor;
  }

  public addInstances(count: number): T[] {
    const amount = Math.max(0, count | 0);
    if (!amount) return [];
    this.reserveInstances(this.actors.length + amount);
    const created = this.appendStructsToArray<T>('instances', amount);
    for (const actor of created) {
      actor.initialize();
      this.actors.push(actor);
    }
    this.instancesCount = this.actors.length;
    this.instanceSoA.ensureCapacity(this.actors.length);
    this._refreshViewsIfGrown();
    this.showAll();
    return created;
  }

  public removeInstance(instance: number | T): T | undefined {
    const index =
      typeof instance === 'number' ? instance | 0 : this.actors.indexOf(instance);
    if (index < 0 || index >= this.actors.length) return undefined;
    const last = this.actors.length - 1;
    const removed = this.actors[index];
    if (index !== last) this.actors[index] = this.actors[last];
    this.actors.pop();
    this.removeStructFromArray('instances', index, 'swap');
    this.instanceSoA.removeSwap(index);
    this.instancesCount = this.actors.length;
    this.showAll();
    return removed;
  }

  public showAll(): void {
    this.instanceSoA.beginVisibilityPass(this.actors.length);
    for (let i = 0; i < this.actors.length; i++) this.instanceSoA.appendVisible(i);
    this.instanceSoA.finishVisibilityPass(this.actors.length);
    this.visibleCount = this.instanceSoA.visibleCount;
  }

  public applyVisibilityReduction(
    visibleIndices: ArrayLike<number>,
    cullingFlags?: ArrayLike<number>
  ): void {
    this.instanceSoA.ensureCapacity(this.actors.length);
    this.instanceSoA.applyVisibilityPass(visibleIndices, cullingFlags);
    this.visibleCount = this.instanceSoA.visibleCount;
  }
}
