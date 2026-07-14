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

export interface ShadoMaterialOptions<TActor extends ShadoActor = ShadoActor> {
  defines?: string[];
  logOnCompile?: boolean;
  picking?: boolean | ShadoInstanceAsyncPickingOptions<TActor>;
  useVat?: boolean;
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
  public get effect() {
    return this._effect;
  }
  public set effect(e: Effect | null) {
    this._effect = e;
  }
  public set vatDQ(v: VATBuilder | undefined) {
    this._vat = v;
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
    const useVat = opts?.useVat ?? true;

    // ── Detect bone influencers and set attributes/defines ───────────────────
    const influencers = useVat ? (mesh.numBoneInfluencers ?? (mesh.skeleton ? 4 : 0)) : 0;
    const attributes = ['position', 'uv', 'aPage', 'aRect'];

    const defines = new Set<string>(opts?.defines ?? []);
    if (influencers > 0) defines.add('USE_BONES');

    // ── Decide texture features from current mesh material ───────────────────
    const tex = pickCommonTextures(mesh.material);
    if (tex.albedo) defines.add('USE_ALBEDO');
    if (tex.opacity) defines.add('USE_OPACITY');
    if (tex.emissive) defines.add('USE_EMISSIVE');

    // ── Uniforms & samplers ──────────────────────────────────────────────────

    const uniforms = useStorageWGSL
      ? ['worldViewProjection']
      : ['worldViewProjection', ...shaderIo.uniforms];
    if (useVat) {
      uniforms.push('bakedVertexAnimationTime');
      uniforms.push('uDQWidth');
      uniforms.push('uDQTilesX');
      uniforms.push('uDQStrideTexels');
      uniforms.push('uDQHasScale');
    }

    const samplers = [...shaderIo.samplers, ...(useVat ? ['uDQAtlas'] : []), 'uAtlasArray'];

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
      // eslint-disable-next-line no-console
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
      // eslint-disable-next-line no-console
      console.error(`ShadoMaterial ${name} error:`, errors);
      if (logOnCompile) {
        // eslint-disable-next-line no-console
        console.log('Vertex Shader Code:\n', effect._vertexSourceCode);
        // eslint-disable-next-line no-console
        console.log('Fragment Shader Code:\n', effect._fragmentSourceCode);
      }
    };
    this.onCompiled = (eff: Effect) => {
      this.effect = eff;
      this._activeEffect = eff;
      if (logOnCompile) {
        // eslint-disable-next-line no-console
        console.log(
          `Effect compiled: ${name}\n` +
            `Vertex: ${eff._vertexSourceCode?.length ?? 0} chars\n` +
            `Fragment: ${eff._fragmentSourceCode?.length ?? 0} chars`
        );
      }
    };

    this.forceCompilation(mesh);
    this.backFaceCulling = false;
    this.sideOrientation = BABYLON.Material.CounterClockWiseSideOrientation;

    // ── Bind textures from source material, if any ───────────────────────────
    if (tex.albedo) this.setTexture('albedoTex', tex.albedo);
    if (tex.opacity) this.setTexture('opacityTex', tex.opacity);
    if (tex.emissive) this.setTexture('emissiveTex', tex.emissive);

    // Alpha handling
    const needsAlpha = defines.has('USE_OPACITY');
    this.needAlphaBlending = () => needsAlpha;
    if (needsAlpha) this.alphaMode = BABYLON.Engine.ALPHA_COMBINE;

    // Override the mesh's render method to inject our instanced draw
    const originalRender = mesh.render.bind(mesh);
    let lastSkipReason = '';
    let lastDebugAt = 0;
    let loggedFirstDraw = false;
    const logRenderState = (reason: string, extra?: Record<string, unknown>) => {
      if (!logOnCompile) return;
      const now = performance.now();
      const visibleCount = (shado as any).getVisibleCount?.() ?? (shado as any).visibleCount;
      const instanceCount = (shado as any).instanceCount;
      const stateKey = `${reason}:${visibleCount}:${instanceCount}`;
      if (stateKey === lastSkipReason && now - lastDebugAt < 2000) return;
      lastSkipReason = stateKey;
      lastDebugAt = now;
      // eslint-disable-next-line no-console
      console.debug(`ShadoMaterial ${name} render state:`, {
        mesh: mesh.name,
        reason,
        visibleCount,
        instanceCount,
        subMeshes: mesh.subMeshes.length,
        world: mesh.getWorldMatrix().asArray(),
        effectReady: subMeshDebugEffect(mesh)?.isReady() ?? false,
        ...extra,
      });
    };
    mesh.render = (subMesh: any, enableAlphaMode: boolean): any => {
      shado.commit();
      (shado as any).bindMaterial?.(this);
      this.setTexture('uAtlasArray', atlas.texture);
      if (useVat) this._vat?.bindMaterial(this);

      if (!this.isReadyForSubMesh(mesh, subMesh)) {
        logRenderState('material not ready', {
          indexStart: subMesh.indexStart,
          indexCount: subMesh.indexCount,
        });
        return mesh;
      }
      const n = (shado as any).getVisibleCount?.() ?? (shado as any).visibleCount ?? 0;

      if (n <= 0) {
        logRenderState('no visible instances', {
          indexStart: subMesh.indexStart,
          indexCount: subMesh.indexCount,
        });
        return mesh;
      }

      const effect = subMesh.effect ?? this.getEffect();
      if (!effect?.isReady()) {
        if (logOnCompile) {
          // eslint-disable-next-line no-console
          console.debug(`ShadoMaterial ${name} render skipped: effect not ready`, {
            mesh: mesh.name,
            visibleCount: n,
            materialEffectReady: this.getEffect()?.isReady() ?? false,
            subMeshEffectReady: subMesh.effect?.isReady() ?? false,
          });
        }
        return mesh;
      }

      const drawWrapper = (this as any)._storeEffectOnSubMeshes
        ? subMesh._drawWrapper
        : (this as any)._getDrawWrapper();
      if (!drawWrapper) {
        logRenderState('missing draw wrapper', {
          indexStart: subMesh.indexStart,
          indexCount: subMesh.indexCount,
        });
        return mesh;
      }
      (this as any)._preBind(
        drawWrapper,
        (mesh as any)._internalMeshDataInfo?._effectiveSideOrientation
      );

      const worldMatrix = mesh.getWorldMatrix();
      const transformMatrix = scene.getTransformMatrix();
      const wvp = worldMatrix.multiply(transformMatrix);
      effect.setMatrix('worldViewProjection', wvp);

      mesh._bind(subMesh, effect, BABYLON.Material.TriangleFillMode);

      if (enableAlphaMode && this.needAlphaBlending()) {
        engine.setAlphaMode(this.alphaMode);
      }

      shado.bind(effect);
      effect.setTexture('uAtlasArray', atlas.texture);
      if (useVat) {
        this._vat?.bind(effect);
        effect.setFloat('bakedVertexAnimationTime', this._timeSec);
      }

      (mesh as any)._draw(subMesh, BABYLON.Material.TriangleFillMode, n);
      this.unbind();
      if (logOnCompile && !loggedFirstDraw) {
        loggedFirstDraw = true;
        const child0 = (shado as any).children?.[0];
        // eslint-disable-next-line no-console
        console.debug(`ShadoMaterial ${name} first instanced draw submitted:`, {
          mesh: mesh.name,
          visibleCount: n,
          instanceCount: (shado as any).instanceCount,
          indexStart: subMesh.indexStart,
          indexCount: subMesh.indexCount,
          verticesStart: subMesh.verticesStart,
          verticesCount: subMesh.verticesCount,
          unIndexed: (mesh as any)._unIndexed,
          vertices: mesh.getTotalVertices(),
          indices: mesh.getTotalIndices(),
          vat: this._vat
            ? {
                framesTotal: this._vat.framesTotal,
                bones: this._vat.bones,
                dqWidthBones: this._vat.dqWidthBones,
                dqTilesX: this._vat.dqTilesX,
                dqStrideTexels: this._vat.dqStrideTexels,
                dqHasScale: this._vat.dqHasScale,
                dqTexReady: this._vat.dqTex?.isReady?.() ?? false,
              }
            : null,
          atlasReady: atlas.texture?.isReady?.() ?? false,
          firstChild: child0
            ? {
                translation: Array.from(child0.translation ?? []),
                visibleIndex: child0.visibleIndex,
                visibleFlag: child0.visibleFlag,
                animationBuffer: Array.from(child0.animationBuffer ?? []),
              }
            : null,
        });
      }

      return mesh;
    };

    const timeObs = scene.onBeforeRenderObservable.add(() => {
      if (!this._paused) {
        const dt = engine.getDeltaTime() * 0.001;
        this._timeSec += dt * this._timeScale;
      }
    });

    this.onDisposeObservable.add(() => {
      scene.onBeforeRenderObservable.remove(timeObs);
      this._pickingHandle?.dispose();
      mesh.render = originalRender;
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

function subMeshDebugEffect(mesh: Mesh): Effect | null {
  return (mesh.subMeshes[0] as any)?.effect ?? null;
}

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
