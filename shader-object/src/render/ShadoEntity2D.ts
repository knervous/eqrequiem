import { Shado } from '../core/Shado';
import { field, gpuStruct } from '../decorators';

export const SHADO_ENTITY_VISIBLE = 1 << 0;
export const SHADO_ENTITY_SELECTED = 1 << 1;
export const SHADO_ENTITY_HIGHLIGHTED = 1 << 2;
export const SHADO_ENTITY2D_MESH_INDEX_MOTION_COMPONENT = 3;

export type ShadoUvRect = readonly [number, number, number, number];
export type ShadoRgba = readonly [number, number, number, number];

export interface ShadoEntity2DInput {
  id?: string;
  x: number;
  y: number;
  z?: number;
  width: number;
  depth?: number;
  height?: number;
  rotationRad?: number;
  rotationDeg?: number;
  opacity?: number;
  visible?: boolean;
  selected?: boolean;
  highlighted?: boolean;
  textureLayer?: number;
  uvRect?: ShadoUvRect;
  color?: ShadoRgba;
  sortKey?: number;
  entityIdHash?: number;
  transitionSpeed?: number;
  meshIndex?: number;
  meshTypeId?: number;
}

export interface ShadoEntity2DDestinationInput {
  x: number;
  y: number;
  z?: number;
  width?: number;
  depth?: number;
  transition?: boolean;
  transitionSpeed?: number;
}

export function hashEntityId(id: string | undefined): number {
  if (!id) return 0;
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function entityFlags(input: ShadoEntity2DInput): number {
  let flags = 0;
  if (input.visible !== false) flags |= SHADO_ENTITY_VISIBLE;
  if (input.selected) flags |= SHADO_ENTITY_SELECTED;
  if (input.highlighted) flags |= SHADO_ENTITY_HIGHLIGHTED;
  return flags;
}

@gpuStruct({ name: 'ShadoEntity2D', useWasm: false })
export class ShadoEntity2D extends Shado {
  @field('vec4')
  positionSize!: Float32Array;

  @field('vec4')
  render!: Float32Array;

  @field('vec4')
  destinationSize!: Float32Array;

  @field('vec4')
  motion!: Float32Array;

  @field('vec4')
  uvRect!: Float32Array;

  @field('vec4')
  color!: Float32Array;

  @field('vec4')
  renderState!: Float32Array;

  public setFrom(input: ShadoEntity2DInput): this {
    const rotation =
      input.rotationRad ?? ((input.rotationDeg ?? 0) * Math.PI) / 180;
    const flags = entityFlags(input);
    const layer = input.textureLayer ?? 0;
    const uv = input.uvRect ?? [0, 0, 1, 1];
    const color = input.color ?? [1, 1, 1, 1];
    const hash = input.entityIdHash ?? hashEntityId(input.id);

    const positionSize = [
      input.x,
      input.y,
      Math.max(0.0001, input.width),
      Math.max(0.0001, input.depth ?? input.width),
    ];
    this.positionSize = positionSize as any;
    this.destinationSize = positionSize as any;
    this.motion = [
      0,
      input.transitionSpeed ?? 10,
      0.002,
      input.meshIndex ?? input.meshTypeId ?? 0,
    ] as any;
    this.render = [
      input.z ?? 0,
      Math.max(0.0001, input.height ?? 0.2),
      rotation,
      input.opacity ?? 1,
    ] as any;
    this.uvRect = uv as any;
    this.color = color as any;
    this.renderState = [layer, flags, hash, input.sortKey ?? input.y] as any;

    return this;
  }

  public setDestination(input: ShadoEntity2DDestinationInput): this {
    const width = Math.max(0.0001, input.width ?? this.positionSize[2]);
    const depth = Math.max(0.0001, input.depth ?? this.positionSize[3]);
    this.destinationSize = [input.x, input.y, width, depth] as any;
    if (input.z !== undefined) this.render[0] = input.z;
    this.renderState[1] = this.renderState[1] | SHADO_ENTITY_VISIBLE;
    if (input.transition === false) {
      this.positionSize = [input.x, input.y, width, depth] as any;
      this.motion[0] = 0;
      this.renderState[3] = input.y;
      return this;
    }

    this.motion[0] = input.transition === undefined ? this.motion[0] : 1;
    this.motion[1] = input.transitionSpeed ?? this.motion[1] ?? 10;
    this.renderState[3] = input.y;
    return this;
  }

  public get isVisible(): boolean {
    return ((this.renderState[1] | 0) & SHADO_ENTITY_VISIBLE) !== 0;
  }

  public setVisible(visible: boolean): void {
    const flags = this.renderState[1] | 0;
    this.renderState[1] = visible
      ? flags | SHADO_ENTITY_VISIBLE
      : flags & ~SHADO_ENTITY_VISIBLE;
  }
}
