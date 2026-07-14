import { BABYLON } from '../babylon';
import { Shado } from '../core/Shado';
import { field, gpuStruct, type PendingField } from '../decorators';
import type { InitializeConfig } from '../types';
import {
  defaultShadoDynamicEntityReducerWasmBytes,
  SHADO_DYNAMIC_ENTITY_DELTA_HEADER_BYTES,
  SHADO_DYNAMIC_ENTITY_DELTA_RECORD_BYTES,
  SHADO_DYNAMIC_ENTITY_EXPIRATION_BY_FRAME,
  SHADO_DYNAMIC_ENTITY_EXPIRATION_BY_SIMULATION_TIME,
  SHADO_DYNAMIC_ENTITY_VISIBLE,
  SHADO_ENTITY2D_REDUCER_LAYOUT,
  ShadoDynamicEntityReducerOp,
  wrapShadoDynamicEntityReducerExports,
  type ShadoDynamicEntityReducer,
  type ShadoDynamicEntityReducerDeltaRecord,
} from './ShadoDynamicEntityReducers';
import {
  hashEntityId,
  SHADO_ENTITY2D_MESH_INDEX_MOTION_COMPONENT,
  SHADO_ENTITY_VISIBLE,
  ShadoEntity2D,
  type ShadoEntity2DDestinationInput,
  type ShadoEntity2DInput,
} from './ShadoEntity2D';
import type { ShadoTextureAtlas } from './ShadoTextureAtlas';

export interface ShadoDynamicEntityInput
  extends Omit<ShadoEntity2DInput, 'textureLayer' | 'uvRect'> {
  id: string;
  textureKey?: string;
}

export interface ShadoDynamicEntityDestinationInput extends ShadoEntity2DDestinationInput {
  id: string;
}

export interface ShadoDynamicEntityExpirationInput {
  id: string;
  removeAfterFrame?: number;
  removeAfterSimulationTime?: number;
}

export type ShadoDynamicEntityGeometryMode = 'box' | 'plane' | 'spriteSlab' | 'mesh';

type EntityRecord = {
  id: string;
  textureKey?: string;
};

@gpuStruct({ name: 'ShadoDynamicEntityContainer', useWasm: true })
export class ShadoDynamicEntityContainer extends Shado {
  @field('f32')
  drawCount!: number;

  @field('f32')
  entityCount!: number;

  @field('f32')
  flags!: number;

  @field('f32')
  padding0!: number;

  @field({ arrayOf: 'f32' })
  drawIds!: Float32Array;

  private readonly records: EntityRecord[] = [];
  private readonly indexById = new Map<string, number>();
  private readonly movingIndices = new Set<number>();
  private atlas?: ShadoTextureAtlas;
  private geometryMode: ShadoDynamicEntityGeometryMode = 'box';
  private billboard = false;
  private reducer?: ShadoDynamicEntityReducer;
  private reducerArenaSignature = '';
  private deltaScratchPtr = 0;
  private deltaScratchByteCapacity = 0;

  public static override async initialize(
    engine: any,
    config: InitializeConfig = {}
  ): Promise<boolean> {
    const { additionalFields: configuredAdditionalFields = [], wasm, ...rest } = config;
    const additionalFields: PendingField[] = [
      ...configuredAdditionalFields,
      { name: 'entities', type: { arrayOf: { structOf: ShadoEntity2D } } },
    ];
    const resolvedWasm =
      wasm === undefined
        ? {
            mode: 'precompiled' as const,
            module: await defaultShadoDynamicEntityReducerWasmBytes(),
          }
        : wasm;
    delete (this as any).__cachedSchema;
    return super.initialize(engine, {
      backend: 'datatex',
      ...rest,
      wasm: resolvedWasm,
      additionalFields,
    });
  }

  public constructor(engine: any, atlas?: ShadoTextureAtlas) {
    super(engine);
    this.atlas = atlas;
    this.drawCount = 0;
    this.entityCount = 0;
    this.flags = 0;
  }

  public setAtlas(atlas: ShadoTextureAtlas): void {
    this.atlas = atlas;
  }

  public configureRenderMode(options: {
    geometry?: ShadoDynamicEntityGeometryMode;
    billboard?: boolean;
  }): void {
    this.geometryMode = options.geometry ?? this.geometryMode;
    this.billboard = options.billboard ?? this.billboard;
  }

  public getShaderNamesForRenderMode(
    options: {
      geometry?: ShadoDynamicEntityGeometryMode;
      billboard?: boolean;
    } = {},
    rewrite: boolean = true
  ): { vertex: string; fragment: string } {
    const geometry = options.geometry ?? this.geometryMode;
    const billboard = options.billboard ?? this.billboard;
    const idBase = `${(this as any)._includeName ?? 'ShadoDynamicEntityContainer'}${
      (this as any)._instanceId ?? 0
    }_${geometry}_${billboard ? 'billboard' : 'flat'}`;
    const vKey = `${idBase}VertexShader`;
    const fKey = `${idBase}FragmentShader`;
    const effect = BABYLON.Effect as any;
    if (rewrite || !effect.ShadersStore[vKey] || !effect.ShadersStore[fKey]) {
      const { vs, fs } = this.generateGLSLPairForRenderMode(geometry, billboard);
      effect.ShadersStore[vKey] = vs;
      effect.ShadersStore[fKey] = fs;
    }
    return { vertex: idBase, fragment: idBase };
  }

  public reserve(count: number): void {
    this.reserveStructArray('entities', count);
  }

  public clearEntities(): void {
    this.records.length = 0;
    this.indexById.clear();
    this.movingIndices.clear();
    this.clearStructArray('entities');
    this.syncDrawList();
  }

  public upsert(input: ShadoDynamicEntityInput): number {
    const current = this.indexById.get(input.id);
    if (current !== undefined) {
      this.setEntity(current, input);
      return current;
    }
    return this.add(input);
  }

  public upsertMany(inputs: readonly ShadoDynamicEntityInput[], syncDrawList = true): void {
    this.reserve(this.records.length + inputs.length);
    for (const input of inputs) this.upsert(input);
    if (syncDrawList) this.syncDrawList();
  }

  public add(input: ShadoDynamicEntityInput): number {
    const existing = this.indexById.get(input.id);
    if (existing !== undefined) {
      this.setEntity(existing, input);
      return existing;
    }

    const index = this.records.length;
    const entity = this.addStructToArray<ShadoEntity2D>('entities');
    this.records.push({ id: input.id, textureKey: input.textureKey });
    this.indexById.set(input.id, index);
    this.movingIndices.delete(index);
    this.writeEntity(entity, input);
    this.entityCount = this.records.length;
    return index;
  }

  public remove(id: string): boolean {
    const index = this.indexById.get(id);
    if (index === undefined) return false;

    const last = this.records.length - 1;
    const moved = last !== index ? this.records[last] : undefined;
    const movedWasMoving = last !== index && this.movingIndices.delete(last);
    this.movingIndices.delete(index);
    this.removeStructFromArray('entities', index, 'swap');
    this.records[index] = this.records[last];
    this.records.length = last;
    this.indexById.delete(id);
    if (moved) {
      this.indexById.set(moved.id, index);
      if (movedWasMoving) this.movingIndices.add(index);
    }
    this.entityCount = this.records.length;
    return true;
  }

  public setEntity(index: number, input: ShadoDynamicEntityInput): void {
    const entity = this.getEntity(index);
    if (!entity) throw new RangeError(`No entity at index ${index}`);
    const previous = this.records[index];
    const textureKey = input.textureKey ?? previous.textureKey;
    if (previous.id !== input.id) {
      this.indexById.delete(previous.id);
      this.indexById.set(input.id, index);
    }
    this.records[index] = { id: input.id, textureKey };
    this.movingIndices.delete(index);
    this.writeEntity(entity, { ...input, textureKey });
  }

  public setEntityDestination(input: ShadoDynamicEntityDestinationInput): boolean {
    const index = this.indexById.get(input.id);
    if (index === undefined) return false;
    const entity = this.getEntity(index);
    if (!entity) return false;
    const width = Math.max(0.0001, input.width ?? entity.positionSize[2]);
    const depth = Math.max(0.0001, input.depth ?? entity.positionSize[3]);
    const sameDestination =
      Math.abs(entity.destinationSize[0] - input.x) <= 0.00001 &&
      Math.abs(entity.destinationSize[1] - input.y) <= 0.00001 &&
      Math.abs(entity.destinationSize[2] - width) <= 0.00001 &&
      Math.abs(entity.destinationSize[3] - depth) <= 0.00001 &&
      (input.z === undefined || Math.abs(entity.render[0] - input.z) <= 0.00001);
    if (sameDestination && entity.motion[0] <= 0) {
      return false;
    }
    const reducer = this.ensureSharedReducer();
    if (reducer) {
      const changed =
        this.applySharedReducerDelta([this.destinationRecord(index, input, entity)]) > 0;
      if (changed) this.movingIndices.add(index);
      return changed;
    }
    entity.setDestination(input);
    if (entity.motion[0] > 0) this.movingIndices.add(index);
    else this.movingIndices.delete(index);
    return true;
  }

  public setEntityDestinations(inputs: readonly ShadoDynamicEntityDestinationInput[]): number {
    let updated = 0;
    for (const input of inputs) {
      if (this.setEntityDestination(input)) updated++;
    }
    return updated;
  }

  public setEntityMeshIndex(id: string, meshIndex: number): boolean {
    const index = this.indexById.get(id);
    if (index === undefined) return false;
    const entity = this.getEntity(index);
    if (!entity) return false;
    const nextMeshIndex = Number.isFinite(meshIndex) ? meshIndex : 0;
    if (Math.abs(entity.motion[SHADO_ENTITY2D_MESH_INDEX_MOTION_COMPONENT] - nextMeshIndex) <= 0.00001) {
      return false;
    }
    entity.motion[SHADO_ENTITY2D_MESH_INDEX_MOTION_COMPONENT] = nextMeshIndex;
    this.markArenaDirty();
    return true;
  }

  public setEntityMeshIndices(
    meshIndexById: ReadonlyMap<string, number>,
    defaultMeshIndex = 0
  ): number {
    let updated = 0;
    for (const record of this.records) {
      const meshIndex = meshIndexById.get(record.id) ?? defaultMeshIndex;
      if (this.setEntityMeshIndex(record.id, meshIndex)) {
        updated++;
      }
    }
    return updated;
  }

  public applyReducerDeltaBytes(deltaBytes: Uint8Array): number {
    if (!(deltaBytes instanceof Uint8Array) || deltaBytes.byteLength <= 0) return 0;
    const reducer = this.ensureSharedReducer();
    if (!reducer) return 0;
    if (!this.deltaScratchPtr || deltaBytes.byteLength > this.deltaScratchByteCapacity) {
      this.deltaScratchPtr = reducer.alloc(deltaBytes.byteLength);
      this.deltaScratchByteCapacity = deltaBytes.byteLength;
    }
    new Uint8Array(reducer.memory.buffer, this.deltaScratchPtr, deltaBytes.byteLength).set(deltaBytes);
    const applied = reducer.exports.applyDelta(this.deltaScratchPtr, deltaBytes.byteLength);
    this.getWasmArenaBasePtr();
    if (applied > 0) this.markArenaDirty();
    return applied;
  }

  public tickTransitions(deltaSeconds: number): number {
    const reducer = this.ensureSharedReducer();
    if (reducer) {
      reducer.clearChanged();
      const moved = reducer.exports.stepTransitions(0, Math.max(0, deltaSeconds) * 1000);
      if (moved) this.markArenaDirty();
      return moved;
    }

    const dt = Math.max(0, deltaSeconds);
    if (!dt || !this.movingIndices.size) return 0;

    let moved = 0;
    for (const i of this.movingIndices) {
      const entity = this.getEntity(i);
      if (!entity || entity.motion[0] <= 0) {
        this.movingIndices.delete(i);
        continue;
      }

      const speed = Math.max(0.001, entity.motion[1] || 10);
      const epsilon = Math.max(0.00001, entity.motion[2] || 0.002);
      const alpha = 1 - Math.exp(-speed * dt);
      let remaining = 0;

      for (let lane = 0; lane < 4; lane++) {
        const current = entity.positionSize[lane];
        const target = entity.destinationSize[lane];
        const next = current + (target - current) * alpha;
        entity.positionSize[lane] = next;
        remaining = Math.max(remaining, Math.abs(target - next));
      }

      if (remaining <= epsilon) {
        entity.positionSize[0] = entity.destinationSize[0];
        entity.positionSize[1] = entity.destinationSize[1];
        entity.positionSize[2] = entity.destinationSize[2];
        entity.positionSize[3] = entity.destinationSize[3];
        entity.motion[0] = 0;
        this.movingIndices.delete(i);
      }
      moved++;
    }

    if (moved) this.arena.markDirty?.();
    return moved;
  }

  public setEntityExpiration(input: ShadoDynamicEntityExpirationInput): boolean {
    const index = this.indexById.get(input.id);
    if (index === undefined) return false;
    let flags = 0;
    if (Number.isFinite(input.removeAfterFrame)) {
      flags |= SHADO_DYNAMIC_ENTITY_EXPIRATION_BY_FRAME;
    }
    if (Number.isFinite(input.removeAfterSimulationTime)) {
      flags |= SHADO_DYNAMIC_ENTITY_EXPIRATION_BY_SIMULATION_TIME;
    }
    if (!flags) return false;
    return (
      this.applySharedReducerDelta([
        {
          op: ShadoDynamicEntityReducerOp.SetExpiration,
          index,
          flags,
          removeAfterFrame: input.removeAfterFrame,
          removeAfterSimulationTime: input.removeAfterSimulationTime,
        },
      ]) > 0
    );
  }

  public setEntityExpirations(inputs: readonly ShadoDynamicEntityExpirationInput[]): number {
    const records: ShadoDynamicEntityReducerDeltaRecord[] = [];
    for (const input of inputs) {
      const index = this.indexById.get(input.id);
      if (index === undefined) continue;
      let flags = 0;
      if (Number.isFinite(input.removeAfterFrame)) {
        flags |= SHADO_DYNAMIC_ENTITY_EXPIRATION_BY_FRAME;
      }
      if (Number.isFinite(input.removeAfterSimulationTime)) {
        flags |= SHADO_DYNAMIC_ENTITY_EXPIRATION_BY_SIMULATION_TIME;
      }
      if (!flags) continue;
      records.push({
        op: ShadoDynamicEntityReducerOp.SetExpiration,
        index,
        flags,
        removeAfterFrame: input.removeAfterFrame,
        removeAfterSimulationTime: input.removeAfterSimulationTime,
      });
    }
    return this.applySharedReducerDelta(records);
  }

  public sweepExpired(frameId: number, simulationTime: number): number {
    const reducer = this.ensureSharedReducer();
    if (!reducer) return 0;
    reducer.clearChanged();
    const swept = reducer.exports.sweepExpired(frameId | 0, simulationTime);
    if (swept) {
      this.markArenaDirty();
      this.syncDrawList({ sort: true });
    }
    return swept;
  }

  public getEntity(index: number): ShadoEntity2D | undefined {
    return (this as any)._structArraySlots?.entities?.[index] as ShadoEntity2D | undefined;
  }

  public getEntityIndex(id: string): number | undefined {
    return this.indexById.get(id);
  }

  public get ids(): readonly string[] {
    return this.records.map(r => r.id);
  }

  public syncDrawList(options: { sort?: boolean } = {}): void {
    const drawIds: number[] = [];
    for (let i = 0; i < this.records.length; i++) {
      const entity = this.getEntity(i);
      if (!entity) continue;
      if (((entity.renderState[1] | 0) & SHADO_ENTITY_VISIBLE) === 0) continue;
      drawIds.push(i);
    }

    if (options.sort) {
      drawIds.sort((a, b) => {
        const ea = this.getEntity(a);
        const eb = this.getEntity(b);
        return (ea?.renderState[3] ?? 0) - (eb?.renderState[3] ?? 0);
      });
    }

    this.setVarArray('drawIds', drawIds);
    this.drawCount = drawIds.length;
    this.entityCount = this.records.length;
  }

  private writeEntity(entity: ShadoEntity2D, input: ShadoDynamicEntityInput): void {
    const atlasEntry = this.atlas?.get(input.textureKey ?? 'default');
    entity.setFrom({
      ...input,
      textureLayer: atlasEntry?.layer ?? 0,
      uvRect: atlasEntry
        ? [atlasEntry.rect.u0, atlasEntry.rect.v0, atlasEntry.rect.u1, atlasEntry.rect.v1]
        : [0, 0, 1, 1],
      entityIdHash: hashEntityId(input.id),
    });
  }

  private ensureSharedReducer(): ShadoDynamicEntityReducer | undefined {
    if (!this.wasmModule?.exports || !this.wasmModule.memory) return undefined;
    this.getWasmArenaBasePtr();
    const entityBasePtr = this.getStructArrayPtr('entities');
    const entityCapacity = this.records.length;
    const entityStrideBytes = this.getStructArrayStrideBytes('entities');
    if (!entityBasePtr || !entityStrideBytes) return undefined;

    this.reducer ??= wrapShadoDynamicEntityReducerExports(this.wasmModule.exports);
    const signature = [
      entityBasePtr,
      entityCapacity,
      entityStrideBytes,
      this.getStructArrayCapacity('entities'),
    ].join(':');
    if (signature === this.reducerArenaSignature) {
      return this.reducer;
    }

    this.reducer.initArena({
      entityBasePtr,
      entityCapacity,
      entityStrideBytes,
      positionSizeOffset: SHADO_ENTITY2D_REDUCER_LAYOUT.positionSizeOffset,
      renderOffset: SHADO_ENTITY2D_REDUCER_LAYOUT.renderOffset,
      destinationSizeOffset: SHADO_ENTITY2D_REDUCER_LAYOUT.destinationSizeOffset,
      motionOffset: SHADO_ENTITY2D_REDUCER_LAYOUT.motionOffset,
      renderStateOffset: SHADO_ENTITY2D_REDUCER_LAYOUT.renderStateOffset,
      activeIndexCapacity: Math.max(1, entityCapacity),
      changedIndexCapacity: Math.max(1, entityCapacity * 4),
      expirationCapacity: Math.max(1, entityCapacity),
    });
    this.getWasmArenaBasePtr();
    this.reducerArenaSignature = signature;
    if (this.movingIndices.size) {
      const records: ShadoDynamicEntityReducerDeltaRecord[] = [];
      for (const index of this.movingIndices) {
        if (index >= 0 && index < entityCapacity) {
          records.push({ op: ShadoDynamicEntityReducerOp.MarkActive, index });
        }
      }
      if (records.length) this.reducer.applyDelta(records);
      this.getWasmArenaBasePtr();
      this.reducer.clearChanged();
    }
    return this.reducer;
  }

  private applySharedReducerDelta(
    records: readonly ShadoDynamicEntityReducerDeltaRecord[]
  ): number {
    if (!records.length) return 0;
    const reducer = this.ensureSharedReducer();
    if (!reducer) return 0;
    const encoded = this.encodeSharedReducerDelta(reducer, records);
    const applied = reducer.exports.applyDelta(encoded.ptr, encoded.byteLength);
    this.getWasmArenaBasePtr();
    if (applied > 0) this.markArenaDirty();
    return applied;
  }

  private encodeSharedReducerDelta(
    reducer: ShadoDynamicEntityReducer,
    records: readonly ShadoDynamicEntityReducerDeltaRecord[]
  ): { ptr: number; byteLength: number } {
    const byteLength =
      SHADO_DYNAMIC_ENTITY_DELTA_HEADER_BYTES +
      records.length * SHADO_DYNAMIC_ENTITY_DELTA_RECORD_BYTES;
    if (!this.deltaScratchPtr || byteLength > this.deltaScratchByteCapacity) {
      this.deltaScratchPtr = reducer.alloc(byteLength);
      this.deltaScratchByteCapacity = byteLength;
    }
    return reducer.writeDelta(records, this.deltaScratchPtr);
  }

  private destinationRecord(
    index: number,
    input: ShadoDynamicEntityDestinationInput,
    entity: ShadoEntity2D
  ): ShadoDynamicEntityReducerDeltaRecord {
    const width = Math.max(0.0001, input.width ?? entity.positionSize[2]);
    const depth = Math.max(0.0001, input.depth ?? entity.positionSize[3]);
    return {
      op:
        input.transition === false
          ? ShadoDynamicEntityReducerOp.DirectPlace
          : ShadoDynamicEntityReducerOp.SetDestination,
      index,
      x: input.x,
      y: input.y,
      width,
      depth,
      z: input.z ?? entity.render[0],
      speed: input.transitionSpeed ?? entity.motion[1] ?? 10,
      flags: entity.renderState[1] | 0 | SHADO_DYNAMIC_ENTITY_VISIBLE,
    };
  }

  private generateGLSLPairForRenderMode(
    geometryMode: ShadoDynamicEntityGeometryMode,
    billboard: boolean
  ): { vs: string; fs: string } {
    const schema = this.getSchema();
    const actor = schema.structArrays.entities.schema.name;
    const container = schema.name;
    const storageInclude = `${container}Storage`;
    const offsetsInclude = `${actor}Offsets`;
    const isPlane = geometryMode === 'plane';
    const isMesh = geometryMode === 'mesh';
    const isSpriteSlab = geometryMode === 'spriteSlab';
    const isBillboard = isPlane && billboard;
    const viewUniform = isBillboard ? 'uniform mat4 view;\n' : '';
    const uvBlock = isMesh
      ? `
  vUV = uv;
  vSpriteSlabSurface = 1.0;
`
      : isPlane
      ? `
  vUV = vec2(
    mix(entity.uvRect.x, entity.uvRect.z, uv.x),
    mix(entity.uvRect.y, entity.uvRect.w, 1.0 - uv.y)
  );
  vSpriteSlabSurface = 1.0;
`
      : `
  vUV = vec2(
    mix(entity.uvRect.x, entity.uvRect.z, 1.0 - uv.y),
    mix(entity.uvRect.y, entity.uvRect.w, 1.0 - uv.x)
  );
  vSpriteSlabSurface = ${isSpriteSlab ? 'position.y > 0.49 ? 1.0 : (position.y < -0.49 ? -1.0 : 0.0)' : '1.0'};
`;
    const worldPositionBlock = isBillboard
      ? `
  vec3 center = vec3(positionSize.x, render.x + (positionSize.w * 0.5), positionSize.y);
  vec3 cameraRight = vec3(view[0][0], view[1][0], view[2][0]);
  vec3 cameraUp = vec3(view[0][1], view[1][1], view[2][1]);
  vec3 worldPosition = center
    + cameraRight * (position.x * positionSize.z)
    + cameraUp * (position.y * positionSize.w);
`
      : isPlane
        ? `
  float c = cos(render.z);
  float s = sin(render.z);
  vec2 localPlane = vec2(position.x * positionSize.z, position.y * positionSize.w);
  vec2 rotatedXZ = vec2(localPlane.x * c - localPlane.y * s, localPlane.x * s + localPlane.y * c);
  vec3 worldPosition = vec3(
    positionSize.x + rotatedXZ.x,
    render.x + 0.01,
    positionSize.y + rotatedXZ.y
  );
`
        : `
  vec3 local = position;
  local.x *= positionSize.z;
  local.y *= render.y;
  local.z *= positionSize.w;

  float c = cos(render.z);
  float s = sin(render.z);
  vec2 rotatedXZ = vec2(local.x * c - local.z * s, local.x * s + local.z * c);
  vec3 worldPosition = vec3(
    positionSize.x + rotatedXZ.x,
    render.x + local.y + render.y * 0.5,
    positionSize.y + rotatedXZ.y
  );
`;

    const vs = `
precision highp float;
precision highp int;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 worldViewProjection;
uniform float uShadoEntityMeshIndex;
${viewUniform}#define SHADO_DYNAMIC_ENTITY_${geometryMode.toUpperCase()} 1
${isBillboard ? '#define SHADO_DYNAMIC_ENTITY_BILLBOARD 1\n' : ''}
#include<${actor}>
#include<${offsetsInclude}>
#include<${storageInclude}>
varying vec2 vUV;
varying vec4 vColor;
varying float vLayer;
varying float vSpriteSlabSurface;

void main(void) {
  int drawIndex = gl_InstanceID;
  int entityIndex = int(${container}_drawIds_get(drawIndex) + 0.5);
  ${actor}Header entity = ${container}_entities_get(entityIndex);
  if (abs(entity.motion.w - uShadoEntityMeshIndex) > 0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vUV = vec2(0.0);
    vColor = vec4(0.0);
    vLayer = 0.0;
    vSpriteSlabSurface = -1.0;
    return;
  }

  vec4 positionSize = entity.positionSize;
  vec4 render = entity.render;
${worldPositionBlock}
${uvBlock}
  vColor = vec4(entity.color.rgb, entity.color.a * render.w);
  vLayer = entity.renderState.x;
  gl_Position = worldViewProjection * vec4(worldPosition, 1.0);
}
`;

    const fs = `
precision highp float;
precision highp int;
varying vec2 vUV;
varying vec4 vColor;
varying float vLayer;
varying float vSpriteSlabSurface;
uniform highp sampler2DArray uShadoEntityAtlas;
uniform sampler2D uShadoEntityMeshTexture;
uniform float uUseShadoEntityMeshTexture;

void main(void) {
  vec4 texel = uUseShadoEntityMeshTexture > 0.5
    ? texture2D(uShadoEntityMeshTexture, vUV)
    : texture(uShadoEntityAtlas, vec3(vUV, floor(vLayer + 0.5)));
  vec4 slabSide = vec4(0.70, 0.74, 0.76, vColor.a);
  vec4 outColor = vSpriteSlabSurface < -0.5
    ? vec4(0.0)
    : vSpriteSlabSurface < 0.5
      ? slabSide
      : texel * vColor;
  if (outColor.a <= 0.001) discard;
  gl_FragColor = outColor;
}
`;

    return { vs, fs };
  }

  public override generateGLSLPair(): { vs: string; fs: string } {
    return this.generateGLSLPairForRenderMode(this.geometryMode, this.billboard);
  }
}
