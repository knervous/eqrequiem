// VATObject_DQ.ts
import type { Effect, Scene, Mesh, Skeleton, Texture, AnimationGroup, Matrix } from '../../babylon';
import { BABYLON } from '../../babylon';

export type DQClipInfo = {
  name: string;
  from: number;
  to: number;
  frames: number;
  fps: number;
};

export type DQBuildOpts = {
  useHalfDQ?: boolean;
  forceHalfDQ?: boolean;
  scaleEpsilon?: number;
  debugValidate?: boolean;
  /**
   * Manually specify animation ranges for .babylon files without embedded metadata.
   * If provided, these will be used instead of auto-detection.
   * Example: [{ from: 0, to: 33, name: 'Walk', fps: 30 }, { from: 34, to: 60, name: 'Run', fps: 30 }]
   */
  manualAnimationRanges?: Array<{ from: number; to: number; name?: string; fps?: number }>;
  defaultFPS?: number;
};

export type SerializedDQVAT = {
  kind: 'shado.dq-vat';
  version: 1;
  componentType: 'float32' | 'float16';
  byteOrder: 'little-endian';
  widthTexels: number;
  heightTexels: number;
  framesTotal: number;
  bones: number;
  dqWidthBones: number;
  dqTilesX: number;
  dqStrideTexels: number;
  dqHasScale: boolean;
  clips: DQClipInfo[];
  data: {
    encoding: 'base64';
    byteLength: number;
    value: string;
  };
};

type ScaleDetection = {
  hasScale: boolean;
  hasAnisotropic: boolean;
};
export class VATBuilder {
  public framesTotal: number = 0;
  public bones: number = 0;
  private _dqTex?: Texture;
  private _clips: DQClipInfo[] = [];

  // Layout constants for the shader
  private _dqWidthBones = 0; // bones per row (NOT texels)
  private _dqTilesX = 0; // horizontal tiles per frame (ceil(bones / dqWidthBones))
  private _dqStrideTexels = 2; // texels per bone: 2 (r,d) or 3 (r,d,scale)
  private _dqHasScale = false;
  private _dqWidthTexels = 0;
  private _dqHeightTexels = 0;
  private _dqComponentType: 'float32' | 'float16' = 'float32';
  private _dqPixels?: Float32Array | Uint16Array;

  public get dqTex() {
    return this._dqTex;
  }
  public get dqWidthBones() {
    return this._dqWidthBones;
  }
  public get dqTilesX() {
    return this._dqTilesX;
  }
  public get dqStrideTexels() {
    return this._dqStrideTexels;
  }
  public get dqHasScale() {
    return this._dqHasScale;
  }
  public get dqWidthTexels() {
    return this._dqWidthTexels;
  }
  public get dqHeightTexels() {
    return this._dqHeightTexels;
  }
  public get dqComponentType() {
    return this._dqComponentType;
  }
  public get clips() {
    return this._clips.slice();
  }

  static async initialize(_engine?: any, _config?: any): Promise<boolean> {
    return true;
  }

  /** Build DQ atlas from all animation groups that drive this skeleton. */
  static buildFromScene(
    scene: Scene,
    mesh: Mesh,
    skeleton: Skeleton,
    opts: DQBuildOpts = {}
  ): VATBuilder {
    const engine = scene.getEngine();
    const dq = new VATBuilder();

    // 1) Collect relevant animation groups (those that touch this skeleton)
    const groups = collectBoneDrivingGroups(
      scene,
      skeleton,
      opts.manualAnimationRanges,
      opts.defaultFPS
    );

    if (groups.length === 0) {
      throw new Error('No animation groups or scene animations found for this skeleton.');
    }

    // eslint-disable-next-line no-console
    console.log(
      '[VATBuilder] Found animation groups:',
      groups.length,
      groups.map(g => ({ name: g.name, from: g.from, to: g.to }))
    );

    // 2) Count total frames and record per-clip ranges
    const { clips, framesTotal } = computeClipFrameTable(groups, opts.defaultFPS ?? 60);
    dq._clips = clips;
    dq.framesTotal = framesTotal | 0;

    // 3) Decide whether any clip/bone uses (non-unit) scale
    const scaleEps = opts.scaleEpsilon ?? 1e-5;
    const scaleInfo = detectAnimatedScale(scene, mesh, skeleton, groups, scaleEps);
    const hasScale = scaleInfo.hasScale && !scaleInfo.hasAnisotropic;
    if (scaleInfo.hasAnisotropic) {
      BABYLON.Logger.Warn(
        '[VATBuilder] Detected anisotropic bone scaling; falling back to rigid-only DQ sampling (ignoring per-bone scale).'
      );
    }

    // 4) Bake: for each absolute frame row, pose skeleton and extract bone matrices -> DQ (+optional scale)
    const bones = skeleton.bones.length | 0;
    dq.bones = bones;

    const caps = engine.getCaps();
    const maxTex = caps.maxTextureSize | 0;

    // OPTIMIZATION: Pack scale into qd.w to reduce texture fetches
    // - Standard: qr(vec4) + qd(vec4) = 2 texels, 2 fetches
    // - With scale: qr(vec4) + qd(vec3,scale) = 2 texels, 2 fetches (pack scale into qd.w)
    // This reduces stride from 3→2 when scale is present, saving 33% bandwidth
    const strideTexels = hasScale ? 3 : 2; // Always 2 texels: (qr), (qd.xyz + scale in w)

    const dqWidthBones = Math.max(1, Math.min(bones, Math.floor(maxTex / strideTexels)));
    const tilesX = Math.ceil(bones / dqWidthBones);
    const atlasWidthTexels = dqWidthBones * strideTexels;
    const atlasHeight = framesTotal * tilesX;

    const useHalf = !!opts.useHalfDQ && (!!caps.textureHalfFloat || !!opts.forceHalfDQ);
    const PixelArray = useHalf ? Uint16Array : Float32Array;
    const pixels = new PixelArray(atlasWidthTexels * atlasHeight * 4);

    // Bake loop
    let frameRowBase = 0;

    // Detect if we're using scene.beginAnimation fallback (.babylon files)
    const useSceneBeginAnimation =
      groups.length > 0 && (groups[0] as any).__fromSceneBeginAnimation;

    for (const animationGroup of groups) {
      const from = Math.floor(animationGroup.from ?? 0);
      const to = Math.floor(animationGroup.to ?? from);
      const frames = Math.max(0, to - from + 1) | 0;
      if (frames <= 0) continue;

      skeleton.returnToRest();

      if (!useSceneBeginAnimation) {
        // Standard AnimationGroup approach (glTF)
        animationGroup.reset();
        animationGroup.play(false); // play but don't loop
        animationGroup.pause();
      }

      for (let f = 0; f < frames; f++) {
        // Advance to exact frame
        const targetFrame = from + f;

        if (useSceneBeginAnimation) {
          // Fallback: Use scene.beginAnimation for .babylon files
          // This approach works when animations aren't in AnimationGroups
          scene.beginAnimation(skeleton, targetFrame, targetFrame, false, 1.0);
          scene.render();
        } else {
          // Use the animation group's built-in frame advance
          animationGroup.goToFrame(targetFrame);
          // CRITICAL: Force scene to evaluate animations by calling render
          // This updates all animated properties on bones
          scene.render();
        }

        // Force immediate update of all bones
        for (const bone of skeleton.bones) {
          bone.computeWorldMatrix(true); // force immediate update
        }

        skeleton.prepare();
        skeleton.computeAbsoluteMatrices(true);

        // Write one "frame-row": split across tilesX rows
        const row0 = (frameRowBase + f) * tilesX;

        for (let b = 0; b < bones; b++) {
          // layout: x is bone % dqWidthBones; tile is floor(bone / dqWidthBones)
          const xBone = b % dqWidthBones;
          const tile = (b / dqWidthBones) | 0;
          const yRow = row0 + tile;
          const yTex = yRow;

          // Get the bone's current world-space matrix (finalMatrix), then multiply by inverse bind
          // to get the skinning transform.
          // For Babylon.js: skinMatrix should transform from bind pose to current pose
          const bone = skeleton.bones[b];
          const finalMatrix = bone.getFinalMatrix();
          const inverseBindMatrix = bone.getAbsoluteInverseBindMatrix();

          // The correct formula for skinning is: skinMatrix = inverseBindMatrix × finalMatrix
          // This transforms: bindPose -> world -> currentPose
          const M = finalMatrix.multiply(inverseBindMatrix);

          const S = new BABYLON.Vector3();
          const R = new BABYLON.Quaternion();
          const T = new BABYLON.Vector3();
          M.decompose(S, R, T);
          R.normalize();
          if (R.w < 0.0) {
            R.x = -R.x;
            R.y = -R.y;
            R.z = -R.z;
            R.w = -R.w;
          }
          // CRITICAL: Enforce consistent hemisphere (w >= 0) to prevent blending artifacts
          // Quaternions q and -q represent the same rotation, but blending them causes discontinuities
          const x = R.x,
            y = R.y,
            z = R.z,
            w = R.w;

          const tx = T.x,
            ty = T.y,
            tz = T.z;

          // Dual part: qd = 0.5 * (0, t) * qr
          const dw = -0.5 * (tx * x + ty * y + tz * z);
          const dx = 0.5 * (tx * w + ty * z - tz * y);
          const dy = 0.5 * (-tx * z + ty * w + tz * x);
          const dz = 0.5 * (tx * y - ty * x + tz * w);

          // three texels when scale present: (r), (d), (s,0,0,0)
          // NOTE: DQ cannot represent reflections (negative determinant), so we use absolute scale
          const scaleMagnitude = (Math.abs(S.x) + Math.abs(S.y) + Math.abs(S.z)) / 3.0;
          const maxAxisDiff = Math.max(
            Math.abs(Math.abs(S.x) - Math.abs(S.y)),
            Math.abs(Math.abs(S.x) - Math.abs(S.z)),
            Math.abs(Math.abs(S.y) - Math.abs(S.z))
          );
          const isUniform = maxAxisDiff <= scaleEps;
          const uniformScale = scaleMagnitude; // Always use positive scale
          const useScale = hasScale && isUniform;
          const s = useScale ? uniformScale : 1.0;

          // Write texels: baseX = xBone * strideTexels
          let px = (yTex * atlasWidthTexels + xBone * strideTexels) * 4;

          if (useHalf) {
            const H = BABYLON.ToHalfFloat;
            const p16 = pixels as Uint16Array;
            p16[px + 0] = H(x);
            p16[px + 1] = H(y);
            p16[px + 2] = H(z);
            p16[px + 3] = H(w);
            px += 4;
            p16[px + 0] = H(dx);
            p16[px + 1] = H(dy);
            p16[px + 2] = H(dz);
            p16[px + 3] = H(dw);
            px += 4;
            if (hasScale) {
              p16[px + 0] = H(s);
              p16[px + 1] = 0;
              p16[px + 2] = 0;
              p16[px + 3] = 0;
            }
          } else {
            const p32 = pixels as Float32Array;
            p32[px + 0] = x;
            p32[px + 1] = y;
            p32[px + 2] = z;
            p32[px + 3] = w;
            px += 4;
            p32[px + 0] = dx;
            p32[px + 1] = dy;
            p32[px + 2] = dz;
            p32[px + 3] = dw;
            px += 4;
            if (hasScale) {
              p32[px + 0] = s;
              p32[px + 1] = 0;
              p32[px + 2] = 0;
              p32[px + 3] = 0;
            }
          }
        }
      }

      animationGroup.stop(); // restore group state
      frameRowBase += frames;
    }

    // 5) Create RawTexture (NEAREST, no mips, CLAMP)
    const dqTex = new BABYLON.RawTexture(
      pixels,
      atlasWidthTexels,
      atlasHeight,
      BABYLON.Engine.TEXTUREFORMAT_RGBA,
      engine,
      false, // no mipmaps
      false, // invertY
      BABYLON.Texture.NEAREST_NEAREST,
      useHalf ? BABYLON.Engine.TEXTURETYPE_HALF_FLOAT : BABYLON.Engine.TEXTURETYPE_FLOAT
    );
    dqTex.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
    dqTex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;

    dq._dqTex = dqTex;
    dq._dqWidthBones = dqWidthBones;
    dq._dqTilesX = tilesX;
    dq._dqStrideTexels = strideTexels;
    dq._dqHasScale = hasScale;
    dq._dqWidthTexels = atlasWidthTexels;
    dq._dqHeightTexels = atlasHeight;
    dq._dqComponentType = useHalf ? 'float16' : 'float32';
    dq._dqPixels = pixels;

    return dq;
  }

  public toSerialized(): SerializedDQVAT {
    if (!this._dqPixels) {
      throw new Error('VATBuilder.toSerialized() called before DQ pixels were built');
    }
    const bytes = new Uint8Array(
      this._dqPixels.buffer,
      this._dqPixels.byteOffset,
      this._dqPixels.byteLength
    );
    return {
      kind: 'shado.dq-vat',
      version: 1,
      componentType: this._dqComponentType,
      byteOrder: 'little-endian',
      widthTexels: this._dqWidthTexels,
      heightTexels: this._dqHeightTexels,
      framesTotal: this.framesTotal,
      bones: this.bones,
      dqWidthBones: this._dqWidthBones,
      dqTilesX: this._dqTilesX,
      dqStrideTexels: this._dqStrideTexels,
      dqHasScale: this._dqHasScale,
      clips: this.clips,
      data: {
        encoding: 'base64',
        byteLength: bytes.byteLength,
        value: bytesToBase64(bytes),
      },
    };
  }

  public static fromSerialized(scene: Scene, serialized: SerializedDQVAT): VATBuilder {
    if (serialized.kind !== 'shado.dq-vat' || serialized.version !== 1) {
      throw new Error('VATBuilder.fromSerialized() received an unsupported DQ VAT payload');
    }

    const bytes = base64ToBytes(serialized.data.value);
    if (bytes.byteLength !== serialized.data.byteLength) {
      throw new Error(
        `Serialized DQ VAT byte length mismatch: expected ${serialized.data.byteLength}, got ${bytes.byteLength}`
      );
    }

    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const pixels =
      serialized.componentType === 'float16' ? new Uint16Array(buffer) : new Float32Array(buffer);

    const dqTex = BABYLON.RawTexture.CreateRGBATexture(
      pixels,
      serialized.widthTexels,
      serialized.heightTexels,
      scene,
      false,
      false,
      BABYLON.Texture.NEAREST_NEAREST,
      serialized.componentType === 'float16'
        ? BABYLON.Engine.TEXTURETYPE_HALF_FLOAT
        : BABYLON.Engine.TEXTURETYPE_FLOAT
    );
    dqTex.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
    dqTex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;

    const dq = new VATBuilder();
    dq.framesTotal = serialized.framesTotal;
    dq.bones = serialized.bones;
    dq._clips = serialized.clips.slice();
    dq._dqTex = dqTex;
    dq._dqWidthBones = serialized.dqWidthBones;
    dq._dqTilesX = serialized.dqTilesX;
    dq._dqStrideTexels = serialized.dqStrideTexels;
    dq._dqHasScale = serialized.dqHasScale;
    dq._dqWidthTexels = serialized.widthTexels;
    dq._dqHeightTexels = serialized.heightTexels;
    dq._dqComponentType = serialized.componentType;
    dq._dqPixels = pixels;
    return dq;
  }

  public bind(effect: Effect) {
    if (this._dqTex) {
      effect.setTexture('uDQAtlas', this._dqTex);
    } else {
      console.error('[VATBuilder.bind] ERROR: No DQ texture exists!');
    }
    effect.setInt('uDQWidth', this._dqWidthBones);
    effect.setInt('uDQTilesX', this._dqTilesX);
    effect.setInt('uDQStrideTexels', this._dqStrideTexels);
    effect.setBool('uDQHasScale', this._dqHasScale);
  }

  public bindMaterial(material: { setTexture: Function; setInt: Function }) {
    if (this._dqTex) {
      material.setTexture('uDQAtlas', this._dqTex);
    } else {
      console.error('[VATBuilder.bindMaterial] ERROR: No DQ texture exists!');
    }
    material.setInt('uDQWidth', this._dqWidthBones);
    material.setInt('uDQTilesX', this._dqTilesX);
    material.setInt('uDQStrideTexels', this._dqStrideTexels);
    material.setInt('uDQHasScale', this._dqHasScale ? 1 : 0);
  }

  public dispose() {
    (this._dqTex as any)?.dispose?.();
    this._dqTex = undefined as any;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  const maybeBuffer = (globalThis as any).Buffer;
  if (maybeBuffer?.from) return maybeBuffer.from(bytes).toString('base64');

  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const maybeBuffer = (globalThis as any).Buffer;
  if (maybeBuffer?.from) return new Uint8Array(maybeBuffer.from(value, 'base64'));

  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function collectBoneDrivingGroups(
  scene: Scene,
  skeleton: Skeleton,
  manualRanges?: Array<{ from: number; to: number; name?: string; fps?: number }>,
  defaultFPS?: number
): AnimationGroup[] {
  // If manual ranges provided, use them directly
  if (manualRanges && manualRanges.length > 0) {
    // eslint-disable-next-line no-console
    console.log('[VATBuilder] Using manually specified animation ranges:', manualRanges);
    return manualRanges.map((range, idx) => {
      const group = new BABYLON.AnimationGroup(range.name ?? `ManualClip_${idx}`, scene);
      (group as any).__fromSceneBeginAnimation = true;
      (group as any).__manualFPS = range.fps ?? defaultFPS ?? 60;
      (group as any).from = range.from;
      (group as any).to = range.to;
      return group;
    });
  }

  // First, try to get AnimationGroups (glTF, modern format)
  const groups = scene.animationGroups.filter(g =>
    g.targetedAnimations?.some(ta => {
      const t: any = ta.target;
      if (!t) return false;

      // CRITICAL: Ensure the target actually belongs to THIS skeleton
      if (t.getClassName?.() === 'Bone') {
        return t.getSkeleton?.() === skeleton;
      }

      if (t.getClassName?.() === 'TransformNode') {
        // For glTF: TransformNodes represent bones, check if skeleton has a bone with matching name
        const boneName = t.name;
        const hasBone = skeleton.bones.some(b => b.name === boneName);
        if (hasBone) return true;

        // Also check parent-based approach as fallback
        const parent = t.parent;
        if (parent && parent.getClassName?.() === 'Bone') {
          return parent.getSkeleton?.() === skeleton;
        }
        return false;
      }

      if (t.skeleton) {
        return t.skeleton === skeleton;
      }

      return false;
    })
  );

  if (groups.length > 0) {
    return groups;
  }

  // Fallback: For .babylon files, create AnimationGroups from skeleton animation ranges
  const skeletonAny = skeleton as any;
  if (skeletonAny.getAnimationRanges && skeletonAny.getAnimationRanges().length > 0) {
    const ranges = skeletonAny.getAnimationRanges();
    return ranges.map((range: any, idx: number) => {
      const group = new BABYLON.AnimationGroup(range.name ?? `Animation_${idx}`, scene);

      // Add all bone animations to the group
      for (const bone of skeleton.bones) {
        const boneAny = bone as any;
        if (boneAny.animations && boneAny.animations.length > 0) {
          for (const animation of boneAny.animations) {
            group.addTargetedAnimation(animation, bone);
          }
        }
      }

      group.normalize(range.from, range.to);
      (group as any).__fromSceneBeginAnimation = true; // Mark for special handling
      return group;
    });
  }

  // Final fallback: Probe for animations using scene.beginAnimation
  // This handles .babylon files where animations exist but aren't in AnimationGroups or ranges
  // eslint-disable-next-line no-console
  console.log(
    '[VATBuilder] No AnimationGroups or ranges found. Probing for animations with scene.beginAnimation...'
  );

  // Save initial bone states
  const initialMatrices: Matrix[] = [];
  for (const bone of skeleton.bones) {
    initialMatrices.push(bone.getFinalMatrix().clone());
  }

  // Common animation range to probe (0-120 frames is typical)
  const probeMax = 120;
  let lastValidFrame = -1;

  // Sample every 10 frames to find the animation extent
  for (let frame = 0; frame <= probeMax; frame += 10) {
    skeleton.returnToRest();
    const animatable = scene.beginAnimation(skeleton, frame, frame, false, 1.0);
    scene.render();
    skeleton.computeAbsoluteMatrices(true);

    // Check if any bone moved from rest pose by comparing matrices
    let hasMoved = false;
    for (let b = 0; b < Math.min(skeleton.bones.length, 5); b++) {
      const bone = skeleton.bones[b];
      const currentMatrix = bone.getFinalMatrix();
      const initialMatrix = initialMatrices[b];

      // Compare matrices - if they differ, animation exists
      if (!currentMatrix.equals(initialMatrix)) {
        hasMoved = true;
        lastValidFrame = frame;
        break;
      }
    }

    if (animatable) {
      animatable.stop();
    }

    if (!hasMoved && lastValidFrame >= 0) {
      // Found end of animation
      break;
    }
  }

  if (lastValidFrame >= 0) {
    // eslint-disable-next-line no-console
    console.log(`[VATBuilder] Detected animation from frame 0 to ${lastValidFrame}`);

    const group = new BABYLON.AnimationGroup('DetectedAnimation', scene);
    (group as any).__fromSceneBeginAnimation = true;
    (group as any).from = 0;
    (group as any).to = lastValidFrame;

    return [group];
  }

  return [];
}

function inferFPSFromGroup(g: AnimationGroup, fallback = 60): number {
  const manualFPS = (g as any).__manualFPS;
  if (manualFPS !== undefined) {
    return manualFPS;
  }
  const ta = g.targetedAnimations?.[0];
  return (ta?.animation?.framePerSecond ?? fallback) || fallback;
}

function computeClipFrameTable(groups: AnimationGroup[], defaultFPS: number) {
  const clips: DQClipInfo[] = [];
  let framesTotal = 0;
  for (const g of groups) {
    const from = Math.floor(g.from ?? 0);
    const to = Math.floor(g.to ?? from);
    const frames = Math.max(0, to - from + 1) | 0;
    if (frames <= 0) continue;
    const fps = inferFPSFromGroup(g, defaultFPS);
    clips.push({
      name: g.name || `clip_${clips.length}`,
      from: framesTotal, // absolute row start
      to: framesTotal + frames - 1, // inclusive
      frames,
      fps,
    });
    framesTotal += frames;
  }
  return { clips, framesTotal };
}

/** Quick pre-pass to see if any bone in any frame has non-unit scale. */
function detectAnimatedScale(
  scene: Scene,
  mesh: Mesh,
  skeleton: Skeleton,
  groups: AnimationGroup[],
  eps: number
): ScaleDetection {
  let hasScale = false;
  let hasAnisotropic = false;

  for (const ag of groups) {
    const from = Math.floor(ag.from ?? 0);
    const to = Math.floor(ag.to ?? from);
    const frames = Math.max(0, to - from + 1) | 0;
    if (frames <= 0) continue;

    skeleton.returnToRest();
    ag.reset();
    ag.play(true);
    ag.pause();

    for (let f = 0; f < frames; f++) {
      ag.goToFrame(from + f);
      scene.render();
      skeleton.computeAbsoluteMatrices(true);

      for (let b = 0; b < skeleton.bones.length; b++) {
        const bone = skeleton.bones[b];
        const finalMatrix = bone.getFinalMatrix();
        const inverseBindMatrix = bone.getAbsoluteInverseBindMatrix();
        const M = finalMatrix.multiply(inverseBindMatrix);

        const S = new BABYLON.Vector3();
        const R = new BABYLON.Quaternion();
        const T = new BABYLON.Vector3();
        M.decompose(S, R, T);
        const sx = Math.abs(S.x);
        const sy = Math.abs(S.y);
        const sz = Math.abs(S.z);
        if (Math.abs(sx - 1) > eps || Math.abs(sy - 1) > eps || Math.abs(sz - 1) > eps) {
          hasScale = true;
          const axisDiff = Math.max(Math.abs(sx - sy), Math.abs(sx - sz), Math.abs(sy - sz));
          if (axisDiff > eps) {
            hasAnisotropic = true;
            ag.stop();
            return { hasScale, hasAnisotropic };
          }
        }
      }
    }
    ag.stop();
  }
  return { hasScale, hasAnisotropic };
}

/**
 * Export helper function to convert matrix to dual quaternion with hemisphere enforcement
 * Used by both production code and tests
 */
export function matrixToDualQuaternion(M: Matrix): {
  qr: { x: number; y: number; z: number; w: number };
  qd: { x: number; y: number; z: number; w: number };
  scale: number;
} {
  const S = new BABYLON.Vector3();
  const R = new BABYLON.Quaternion();
  const T = new BABYLON.Vector3();
  M.decompose(S, R, T);
  R.normalize();

  // CRITICAL: Enforce consistent hemisphere (w >= 0)
  let x = R.x;
  let y = R.y;
  let z = R.z;
  let w = R.w;
  if (w < 0.0) {
    x = -x;
    y = -y;
    z = -z;
    w = -w;
  }

  const tx = T.x;
  const ty = T.y;
  const tz = T.z;

  // Dual part: qd = 0.5 * (0, t) * qr
  const dw = -0.5 * (tx * x + ty * y + tz * z);
  const dx = 0.5 * (tx * w + ty * z - tz * y);
  const dy = 0.5 * (-tx * z + ty * w + tz * x);
  const dz = 0.5 * (tx * y - ty * x + tz * w);

  const scaleMagnitude = (Math.abs(S.x) + Math.abs(S.y) + Math.abs(S.z)) / 3.0;

  return {
    qr: { x, y, z, w },
    qd: { x: dx, y: dy, z: dz, w: dw },
    scale: scaleMagnitude,
  };
}
