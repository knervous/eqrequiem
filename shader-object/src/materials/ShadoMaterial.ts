import {
  BABYLON,
  type Effect,
  type Scene,
  type Mesh,
  type Texture,
  type Material,
  type Ray,
} from '../babylon';
import { Shado } from '../core/Shado';
import { VATBuilder } from '../extensions';
import { ArrayAtlas } from '../extensions/AtlasBuilder/AtlasBuilder';
import type { ShadoActor } from '../extensions/ShadoActor';
import {
  installShadoInstanceClickPicking,
  normalizePickingOptions,
  pickShadoInstanceAtPointer,
  pickShadoInstanceWithRay,
  type ShadoInstanceAsyncPickingOptions,
  type ShadoInstancePickResult,
  type ShadoPickingHandle,
} from '../render/ShadoAsyncPicking';
import type { ShadoConcreteCtor } from '../types';
import type { ShadoInstanceDrawSelection } from '../extensions/ShadoInstanceContainer/ShadoInstanceDrawSelection';

/**
 * Controls the amount of dual-quaternion VAT work performed per vertex.
 *
 * - `full`: all influences with interpolation between animation frames.
 * - `medium`: all influences sampled at one animation frame.
 * - `low`: the dominant influence sampled at one animation frame.
 * - `rigid`: disables VAT and renders the source mesh in its rest pose.
 */
export type ShadoVatQualityTier = 'full' | 'medium' | 'low' | 'rigid';

export interface ShadoMaterialOptions<TActor extends ShadoActor = ShadoActor> {
  defines?: string[];
  logOnCompile?: boolean;
  picking?: boolean | ShadoInstanceAsyncPickingOptions<TActor>;
  useVat?: boolean;
  vatQuality?: ShadoVatQualityTier;
  /** Additional application-owned textures exposed to generated shaders. */
  textures?: Record<string, Texture>;
  /** Optional compact actor list for one module/cohort draw. */
  drawSelection?: ShadoInstanceDrawSelection;
  /** Shared clip range/phase/rate for a synchronized animation cohort. */
  sharedAnimation?: ArrayLike<number> | (() => ArrayLike<number>);
  /** Shared clock used by all materials participating in one cohort. */
  animationTimeSource?: () => number;
}

export class ShadoMaterial<T extends Shado> extends BABYLON.ShaderMaterial {
  private _timeSec = 0;
  private _timeScale = 1;
  private _paused = false;
  private shadoScene: Scene;
  private shadoMesh: Mesh;
  private shadoSource: T;
  private _pickingHandle?: ShadoPickingHandle;

  private _effect: Effect | null = null;
  private _vat?: VATBuilder;
  private readonly _lightDirection = BABYLON.Vector3.Zero();
  private readonly _lightColor = BABYLON.Vector3.Zero();
  private readonly _ambientColor = BABYLON.Vector3.Zero();
  private readonly _sharedAnimation = BABYLON.Vector4.Zero();
  public get effect() {
    return this._effect;
  }
  public set effect(e: Effect | null) {
    this._effect = e;
  }
  public set vatDQ(v: VATBuilder | undefined) {
    this._vat = v;
    v?.bindMaterial(this);
  }
  public get vatDQ() {
    return this._vat;
  }
  constructor(
    scene: Scene,
    mesh: Mesh,
    atlas: ArrayAtlas,
    shado: T,
    opts?: ShadoMaterialOptions<any>
  ) {
    const engine = scene.getEngine();
    const isWebGPU = engine.isWebGPU;
    const useStorageWGSL = isWebGPU && (shado.constructor as any).backingPreference === 'storage';
    const shaderIo = (shado.constructor as ShadoConcreteCtor).shaderIO(engine);
    const name = mesh?.name ?? shado.getSchema()?.name ?? 'Shado';
    const vatQuality = opts?.vatQuality ?? 'full';
    const useVat = (opts?.useVat ?? true) && vatQuality !== 'rigid';

    // ── Detect bone influencers and set attributes/defines ───────────────────
    const influencers = useVat ? (mesh.numBoneInfluencers ?? (mesh.skeleton ? 4 : 0)) : 0;
    const attributes = ['position', 'uv', 'aMeta', 'aRect'];
    if (mesh.isVerticesDataPresent('normal')) attributes.push('normal');
    for (const kind of mesh.getVerticesDataKinds()) {
      if (kind.startsWith('a') && !attributes.includes(kind)) attributes.push(kind);
    }

    const defines = new Set<string>(opts?.defines ?? []);
    if (mesh.isVerticesDataPresent('normal')) defines.add('SHADO_HAS_NORMAL');
    if (influencers > 0) defines.add('USE_BONES');
    if (useVat && (vatQuality === 'medium' || vatQuality === 'low')) {
      defines.add('SHADO_VAT_SINGLE_FRAME');
    }
    if (useVat && vatQuality === 'low') {
      defines.add('SHADO_VAT_DOMINANT_BONE');
    }
    if (useVat && opts?.sharedAnimation) {
      defines.add('SHADO_VAT_SHARED_POSE');
    }

    // ── Decide texture features from current mesh material ───────────────────
    const tex = pickCommonTextures(mesh.material);
    if (tex.albedo) defines.add('USE_ALBEDO');
    if (tex.opacity) defines.add('USE_OPACITY');
    if (tex.emissive) defines.add('USE_EMISSIVE');

    // ── Uniforms & samplers ──────────────────────────────────────────────────

    const uniforms = useStorageWGSL
      ? ['worldViewProjection', 'uShadoLightDirection', 'uShadoLightColor', 'uShadoAmbientColor']
      : [
          'worldViewProjection',
          'uShadoLightDirection',
          'uShadoLightColor',
          'uShadoAmbientColor',
          ...shaderIo.uniforms,
        ];
    if ('visibleActorIndices' in (shado as any) && !useStorageWGSL) {
      uniforms.push('uShadoVisibleIndexTexWidth');
    }
    if (useVat) {
      uniforms.push('bakedVertexAnimationTime');
      uniforms.push('uDQWidth');
      uniforms.push('uDQTilesX');
      uniforms.push('uDQFramesX');
      uniforms.push('uDQStrideTexels');
      uniforms.push('uDQHasScale');
      if (opts?.sharedAnimation) uniforms.push('uShadoSharedAnimation');
    }

    const samplers = [
      ...shaderIo.samplers,
      ...('visibleActorIndices' in (shado as any) && !useStorageWGSL
        ? ['uShadoVisibleIndices', 'uShadoVisibilityFlags']
        : []),
      ...(useVat ? ['uDQAtlas'] : []),
      'uAtlasArray',
      ...Object.keys(opts?.textures ?? {}),
    ];

    const { vertex, fragment } = shado.getShaderNames();

    super(
      `ShadoMaterial_${name}`,
      scene,
      { vertex, fragment },
      {
        attributes,
        uniforms,
        samplers,
        uniformBuffers: ['Scene'],
        defines: Array.from(new Set(defines)),
        shaderLanguage: useStorageWGSL ? BABYLON.ShaderLanguage.WGSL : BABYLON.ShaderLanguage.GLSL,
      }
    );

    this.shadoScene = scene;
    this.shadoMesh = mesh;
    this.shadoSource = shado;

    const logOnCompile = opts?.logOnCompile ?? false;
    if (logOnCompile) {
      const missingAttributes = attributes.filter(attr => !mesh.isVerticesDataPresent(attr));
      console.debug(`ShadoMaterial ${name} created:`, {
        mesh: mesh.name,
        vertices: mesh.getTotalVertices(),
        indices: mesh.getTotalIndices(),
        subMeshes: mesh.subMeshes.length,
        skeleton: mesh.skeleton?.name,
        bones: mesh.skeleton?.bones.length,
        influencers,
        attributes,
        missingAttributes,
        uniforms,
        samplers,
        defines: Array.from(defines),
      });
    }
    this.onError = (effect, errors) => {
      console.error(`ShadoMaterial ${name} error:`, errors);
      if (logOnCompile) {
        console.log('Vertex Shader Code:\n', effect._vertexSourceCode);
        console.log('Fragment Shader Code:\n', effect._fragmentSourceCode);
      }
    };
    this.onCompiled = (eff: Effect) => {
      this.effect = eff;
      this._activeEffect = eff;
      if (logOnCompile) {
        console.log(
          `Effect compiled: ${name}\n` +
            `Vertex: ${eff._vertexSourceCode?.length ?? 0} chars\n` +
            `Fragment: ${eff._fragmentSourceCode?.length ?? 0} chars`
        );
      }
    };

    this.backFaceCulling = false;
    this.sideOrientation = BABYLON.Material.CounterClockWiseSideOrientation;

    // ── Bind textures from source material, if any ───────────────────────────
    if (tex.albedo) this.setTexture('albedoTex', tex.albedo);
    if (tex.opacity) this.setTexture('opacityTex', tex.opacity);
    if (tex.emissive) this.setTexture('emissiveTex', tex.emissive);
    for (const [uniform, texture] of Object.entries(opts?.textures ?? {})) {
      this.setTexture(uniform, texture);
    }

    // Alpha handling
    const needsAlpha = defines.has('USE_OPACITY');
    this.needAlphaBlending = () => needsAlpha;
    if (needsAlpha) this.alphaMode = BABYLON.Engine.ALPHA_COMBINE;

    // Babylon's normal material path already supports an explicit hardware
    // instance count. Keep Shado on that public path so effects, render passes,
    // observables, depth state, and third-party mesh integrations remain owned
    // by Babylon instead of replacing Mesh.render or calling private draw APIs.
    const syncMaterial = () => {
      shado.syncGpu((engine as any).frameId ?? 0);
      shado.bindMaterial(this);
      opts?.drawSelection?.commit();
      opts?.drawSelection?.bind(this);
      this.setTexture('uAtlasArray', atlas.texture);
      this.bindBaseLighting();
      if (useVat) {
        this._vat?.bindMaterial(this);
        this.setFloat(
          'bakedVertexAnimationTime',
          opts?.animationTimeSource?.() ?? this._timeSec
        );
        const sharedAnimation = typeof opts?.sharedAnimation === 'function'
          ? opts.sharedAnimation()
          : opts?.sharedAnimation;
        if (sharedAnimation) {
          this._sharedAnimation.set(
            Number(sharedAnimation[0]) || 0,
            Number(sharedAnimation[1]) || 0,
            Number(sharedAnimation[2]) || 0,
            Number(sharedAnimation[3]) || 0
          );
          this.setVector4('uShadoSharedAnimation', this._sharedAnimation);
        }
      }
      const visibleCount = opts?.drawSelection?.visibleCount ??
        (shado as any).getVisibleCount?.() ?? (shado as any).visibleCount ?? 0;
      mesh.forcedInstanceCount = Math.max(0, visibleCount | 0);
      mesh.isVisible = mesh.forcedInstanceCount > 0;
    };
    syncMaterial();
    this.forceCompilation(mesh);
    const timeObs = scene.onBeforeRenderObservable.add(() => {
      if (!opts?.animationTimeSource && !this._paused) {
        const dt = engine.getDeltaTime() * 0.001;
        this._timeSec += dt * this._timeScale;
      }
      syncMaterial();
    });

    this.onDisposeObservable.add(() => {
      scene.onBeforeRenderObservable.remove(timeObs);
      this._pickingHandle?.dispose();
      opts?.drawSelection?.dispose();
      mesh.forcedInstanceCount = 0;
    });

    const picking = normalizePickingOptions(opts?.picking);
    if (picking) {
      this.setAsyncPicking(picking);
    }
  }

  public setPaused(p: boolean) {
    this._paused = p;
  }
  public setTimeScale(s: number) {
    this._timeScale = s;
  }
  public setTimeSeconds(t: number) {
    this._timeSec = t;
  }

  /** Bind one scene directional light to the base per-instance Lambert path. */
  private bindBaseLighting(): void {
    const lights = ((this.shadoScene as any).lights ?? []).filter(
      (light: any) => light?.isEnabled?.() ?? true
    );
    const directional =
      lights.find((light: any) => light?.getClassName?.() === 'DirectionalLight') ??
      lights.find((light: any) => light?.getClassName?.() === 'HemisphericLight');
    const isHemispheric = directional?.getClassName?.() === 'HemisphericLight';
    const sourceDirection = directional?.direction ?? { x: -0.45, y: -1, z: 0.35 };
    let x = Number(sourceDirection.x) || 0;
    let y = Number(sourceDirection.y) || 0;
    let z = Number(sourceDirection.z) || 0;
    if (!isHemispheric) {
      x = -x;
      y = -y;
      z = -z;
    }
    const inverseLength = 1 / Math.max(Math.hypot(x, y, z), 1e-8);
    this._lightDirection.set(x * inverseLength, y * inverseLength, z * inverseLength);
    this.setVector3('uShadoLightDirection', this._lightDirection);

    const diffuse = directional?.diffuse ?? { r: 1, g: 1, b: 1 };
    const intensity = Number.isFinite(directional?.intensity) ? directional.intensity : 0.8;
    this._lightColor.set(diffuse.r * intensity, diffuse.g * intensity, diffuse.b * intensity);
    this.setVector3('uShadoLightColor', this._lightColor);

    const ambient = (this.shadoScene as any).ambientColor;
    const hasAmbient = ambient && Math.max(ambient.r, ambient.g, ambient.b) > 1e-6;
    this._ambientColor.set(
      hasAmbient ? ambient.r : 0.2,
      hasAmbient ? ambient.g : 0.2,
      hasAmbient ? ambient.b : 0.2
    );
    this.setVector3('uShadoAmbientColor', this._ambientColor);
  }

  public setAsyncPicking<TActor extends ShadoActor>(
    options: boolean | ShadoInstanceAsyncPickingOptions<TActor>
  ): void {
    this._pickingHandle?.dispose();
    const normalized = normalizePickingOptions(options);
    if (!normalized) {
      this._pickingHandle = undefined;
      return;
    }
    this._pickingHandle = installShadoInstanceClickPicking(
      this.shadoScene,
      this.shadoMesh,
      this.shadoSource as any,
      normalized
    );
  }

  public pickAsync<TActor extends ShadoActor = ShadoActor>(
    pointerX = this.shadoScene.pointerX,
    pointerY = this.shadoScene.pointerY,
    options: ShadoInstanceAsyncPickingOptions<TActor> = {}
  ): Promise<ShadoInstancePickResult<TActor> | null> {
    return pickShadoInstanceAtPointer(
      this.shadoScene,
      this.shadoMesh,
      this.shadoSource as any,
      pointerX,
      pointerY,
      options
    );
  }

  public pickWithRay<TActor extends ShadoActor = ShadoActor>(
    ray: Ray,
    options: ShadoInstanceAsyncPickingOptions<TActor> = {}
  ): ShadoInstancePickResult<TActor> | null {
    return pickShadoInstanceWithRay(this.shadoMesh, this.shadoSource as any, ray, options);
  }
}

// ────────────────────────────────────────────────────────────────────────────

type CommonTextures = {
  albedo?: Texture;
  opacity?: Texture;
  emissive?: Texture;
  normal?: Texture;
};

function pickCommonTextures(mat?: Material | null): CommonTextures {
  const out: CommonTextures = {};
  if (!mat) return out;
  const any: any = mat;

  // Standard
  if (any.diffuseTexture) out.albedo = any.diffuseTexture;
  if (any.opacityTexture) out.opacity = any.opacityTexture;
  if (any.emissiveTexture) out.emissive = any.emissiveTexture;
  if (any.bumpTexture) out.normal = any.bumpTexture;

  // PBR
  if (any.albedoTexture) out.albedo = any.albedoTexture ?? out.albedo;
  if (any.opacityTexture) out.opacity = any.opacityTexture ?? out.opacity;
  if (any.emissiveTexture) out.emissive = any.emissiveTexture ?? out.emissive;
  if (any.normalTexture || any.bumpTexture)
    out.normal = any.normalTexture ?? any.bumpTexture ?? out.normal;

  return out;
}
