import { Shado } from '../core/Shado';
import { field, gpuStruct } from '../decorators';
import type { DQClipInfo } from './VATBuilder/VATBuilder';

/** Base material lighting available to each actor without a custom shader hook. */
export enum ShadoLightingMode {
  Unlit = 0,
  Lambert = 1,
}

@gpuStruct({ name: 'ShadoActor' })
export class ShadoActor extends Shado {
  @field('vec4') translation!: Float32Array;
  /** World-space orientation quaternion (x, y, z, w). */
  @field('vec4') rotation!: Float32Array;
  @field('vec4') color!: Float32Array;
  /** Compatibility field retained at its stable 1.0.x packed offset. */
  @field('i32') visibleIndex!: number;
  @field('u32') nameIndex!: number;
  @field('f32') nameWorldPerEM!: number;
  @field('f32') nameLiftWorld!: number;
  @field('vec4') nameplateColor!: Float32Array;
  @field('vec4') animationBuffer!: Float32Array;
  /** Compatibility field retained at its stable 1.0.x packed offset. */
  @field('i32') visibleFlag!: number;
  @field('f32') padding1!: number;
  @field('f32') padding2!: number;
  @field('f32') padding3!: number;

  /**
   * Per-instance lighting selection. This intentionally occupies the first
   * reserved 1.0.x padding word so enabling lighting does not change the actor
   * ABI or the offsets of fields added by subclasses.
   */
  public get lightingMode(): ShadoLightingMode {
    return this.padding1 === ShadoLightingMode.Lambert
      ? ShadoLightingMode.Lambert
      : ShadoLightingMode.Unlit;
  }
  public set lightingMode(value: ShadoLightingMode) {
    this.padding1 =
      value === ShadoLightingMode.Lambert ? ShadoLightingMode.Lambert : ShadoLightingMode.Unlit;
  }

  private readonly _worldPerEM = 0.16;
  private readonly _yLiftWorld = 2.4;

  constructor(engine: any) {
    super(engine, true);
  }

  public initialize() {
    this.translation = this._randomTranslation();
    this.rotation = new Float32Array([0, 0, 0, 1]);
    this.color = this._randColor();
    this.visibleIndex = -1;
    this.nameIndex = -1;
    this.nameWorldPerEM = this._worldPerEM;
    this.nameLiftWorld = this._yLiftWorld;
    this.nameplateColor = new Float32Array([1.0, 1.0, 1.0, 1.0]);
    this.animationBuffer = new Float32Array([0, 0, 0, 60]);
    this.visibleFlag = 1;
    this.lightingMode = ShadoLightingMode.Unlit;
    this.padding2 = 0;
    this.padding3 = 0;
  }

  public playRandomAnimation(animationRanges: DQClipInfo[]) {
    if (!animationRanges || animationRanges.length === 0) {
      this.animationBuffer = new Float32Array([0, 0, 0, 60]);
      return;
    }

    const randomIndex = Math.floor(Math.random() * animationRanges.length);
    const clip = animationRanges[randomIndex];
    const total = clip.to - clip.from;
    const randomStart = Math.floor(Math.random() * total);
    this.animationBuffer = new Float32Array([
      clip.from,
      clip.to,
      randomStart,
      clip.fps || 60,
    ]);
  }

  private _rand(min: number, max: number) {
    return min + Math.random() * (max - min);
  }
  private _randColor(): Float32Array {
    return new Float32Array([
      this._rand(0.1, 1.0),
      this._rand(0.1, 1.0),
      this._rand(0.1, 1.0),
      1.0,
    ]);
  }
  private _randomTranslation(): Float32Array {
    return new Float32Array([this._rand(-45, 45), this._rand(-45, 45), this._rand(-45, 45), 1.0]);
  }
}

@gpuStruct({ name: 'TestClass' })
export class TestClass extends ShadoActor {
  @field('vec4') testValue!: Float32Array;
  public testMethod() {
    console.log('Look at my testValue', this.testValue);
  }
}
