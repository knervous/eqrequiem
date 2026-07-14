import {
  BABYLON,
  type AbstractEngine,
  type Effect,
  type Mesh,
  type Ray,
  type Scene,
  type ShaderMaterial,
  type Texture,
} from '../babylon';
import type { ShadoConcreteCtor } from '../types';
import {
  ShadoDynamicEntityContainer,
  type ShadoDynamicEntityGeometryMode,
} from './ShadoDynamicEntityContainer';
import type { ShadoTextureAtlas } from './ShadoTextureAtlas';
import {
  installShadoDynamicEntityClickPicking,
  normalizePickingOptions,
  pickShadoDynamicEntityAtPointer,
  pickShadoDynamicEntityWithRay,
  type ShadoDynamicEntityAsyncPickingOptions,
  type ShadoDynamicEntityPickResult,
  type ShadoPickingHandle,
} from './ShadoAsyncPicking';

export interface ShadoDynamicEntityRendererOptions {
  mesh?: Mesh;
  geometry?: ShadoDynamicEntityGeometryMode;
  billboard?: boolean;
  log?: boolean;
  sortDrawList?: boolean;
  picking?: boolean | ShadoDynamicEntityAsyncPickingOptions;
  meshIndex?: number;
  meshTypeId?: number;
  meshTexture?: Texture | null;
}

export interface ShadoDynamicEntityMeshVariant {
  meshIndex: number;
  mesh: Mesh;
  meshTexture?: Texture | null;
  picking?: boolean | ShadoDynamicEntityAsyncPickingOptions;
}

export interface ShadoDynamicEntityMeshVariantRendererOptions
  extends Omit<
    ShadoDynamicEntityRendererOptions,
    'geometry' | 'mesh' | 'meshIndex' | 'meshTypeId' | 'meshTexture' | 'picking'
  > {
  variants: readonly ShadoDynamicEntityMeshVariant[];
}

export class ShadoDynamicEntityRenderer {
  public readonly mesh: Mesh;
  public readonly material: ShaderMaterial;
  private readonly scene: Scene;
  private readonly engine: AbstractEngine;
  private readonly originalRender: Mesh['render'];
  private pickingHandle?: ShadoPickingHandle;
  private loggedFirstDraw = false;

  public constructor(
    scene: Scene,
    public readonly container: ShadoDynamicEntityContainer,
    public readonly atlas: ShadoTextureAtlas,
    options: ShadoDynamicEntityRendererOptions = {}
  ) {
    this.scene = scene;
    this.engine = scene.getEngine();
    this.container.setAtlas(atlas);
    const geometry = options.geometry ?? 'box';
    const billboard = options.billboard ?? geometry === 'plane';
    const meshIndexInput = options.meshIndex ?? options.meshTypeId;
    const meshIndex = Number.isFinite(meshIndexInput) ? Number(meshIndexInput) : 0;
    const meshTexture = options.meshTexture ?? atlas.texture;
    this.mesh =
      options.mesh ??
      (geometry === 'plane'
        ? BABYLON.MeshBuilder.CreatePlane('shado-dynamic-entity-planes', { size: 1 }, scene)
        : BABYLON.MeshBuilder.CreateBox('shado-dynamic-entities', { size: 1 }, scene));
    this.mesh.alwaysSelectAsActiveMesh = true;

    const shaderIo = (container.constructor as ShadoConcreteCtor).shaderIO(this.engine);
    const shaderNames = container.getShaderNamesForRenderMode({ geometry, billboard });
    const uniforms = [
      'worldViewProjection',
      'uShadoEntityMeshIndex',
      'uUseShadoEntityMeshTexture',
      ...shaderIo.uniforms,
    ];
    if (billboard) uniforms.push('view');

    this.material = new BABYLON.ShaderMaterial('shadoDynamicEntityMaterial', scene, shaderNames, {
      attributes: ['position', 'uv'],
      uniforms,
      samplers: ['uShadoEntityAtlas', 'uShadoEntityMeshTexture', ...shaderIo.samplers],
      uniformBuffers: ['Scene'],
      needAlphaBlending: true,
      shaderLanguage: BABYLON.ShaderLanguage.GLSL,
    });
    this.material.backFaceCulling = geometry === 'box' || geometry === 'spriteSlab';
    this.material.forceDepthWrite = geometry === 'box' || geometry === 'spriteSlab' || geometry === 'mesh';
    this.material.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
    this.material.setTexture('uShadoEntityAtlas', atlas.texture);
    this.material.setTexture('uShadoEntityMeshTexture', meshTexture);
    this.material.setFloat('uShadoEntityMeshIndex', meshIndex);
    this.material.setFloat('uUseShadoEntityMeshTexture', options.meshTexture ? 1 : 0);
    this.mesh.material = this.material;

    if (options.log) {
      this.material.onCompiled = (effect: Effect) => {
        // eslint-disable-next-line no-console
        console.debug('[shado/render] material compiled', {
          mesh: this.mesh.name,
          uniforms: effect.getUniformNames?.(),
          samplers: effect.getSamplers?.(),
        });
      };
      this.material.onError = (_effect: Effect, errors: string) => {
        // eslint-disable-next-line no-console
        console.error('[shado/render] material error', errors);
      };
    }

    this.originalRender = this.mesh.render.bind(this.mesh);
    this.mesh.render = (subMesh: any, enableAlphaMode: boolean): any => {
      this.container.commit();
      this.container.bindMaterial(this.material);
      this.material.setTexture('uShadoEntityAtlas', this.atlas.texture);
      this.material.setTexture('uShadoEntityMeshTexture', meshTexture);
      this.material.setFloat('uShadoEntityMeshIndex', meshIndex);
      this.material.setFloat('uUseShadoEntityMeshTexture', options.meshTexture ? 1 : 0);

      if (!this.material.isReadyForSubMesh(this.mesh, subMesh)) {
        if (options.log) {
          // eslint-disable-next-line no-console
          console.debug('[shado/render] render skipped', {
            reason: 'material not ready',
            drawCount: this.container.drawCount,
            entityCount: this.container.entityCount,
          });
        }
        return this.mesh;
      }

      const drawCount = this.container.drawCount | 0;
      if (drawCount <= 0) return this.mesh;

      const effect = subMesh.effect ?? this.material.getEffect();
      if (!effect?.isReady()) return this.mesh;

      const drawWrapper = (this.material as any)._storeEffectOnSubMeshes
        ? subMesh._drawWrapper
        : (this.material as any)._getDrawWrapper();
      if (!drawWrapper) return this.mesh;

      if (enableAlphaMode && this.material.needAlphaBlending()) {
        this.engine.setAlphaMode(this.material.alphaMode);
      }

      (this.material as any)._preBind(
        drawWrapper,
        (this.mesh as any)._internalMeshDataInfo?._effectiveSideOrientation
      );
      if (this.material.forceDepthWrite) {
        this.engine.setDepthWrite(true);
      }

      effect.setMatrix(
        'worldViewProjection',
        this.mesh.getWorldMatrix().multiply(this.scene.getTransformMatrix())
      );
      if (billboard) effect.setMatrix('view', this.scene.getViewMatrix());
      effect.setFloat('uShadoEntityMeshIndex', meshIndex);
      effect.setFloat('uUseShadoEntityMeshTexture', options.meshTexture ? 1 : 0);
      this.mesh._bind(subMesh, effect, BABYLON.Material.TriangleFillMode);

      this.container.bind(effect);
      effect.setTexture('uShadoEntityAtlas', this.atlas.texture);
      effect.setTexture('uShadoEntityMeshTexture', meshTexture);
      (this.mesh as any)._draw(subMesh, BABYLON.Material.TriangleFillMode, drawCount);
      this.material.unbind();

      if (options.log && !this.loggedFirstDraw) {
        this.loggedFirstDraw = true;
        // eslint-disable-next-line no-console
        console.debug('[shado/render] first draw submitted', {
          mesh: this.mesh.name,
          drawCount,
          entityCount: this.container.entityCount,
          indices: this.mesh.getTotalIndices(),
          vertices: this.mesh.getTotalVertices(),
        });
      }

      return this.mesh;
    };

    const picking = normalizePickingOptions(options.picking);
    if (picking) {
      this.setAsyncPicking(picking);
    }
  }

  public static createMeshVariantRenderers(
    scene: Scene,
    container: ShadoDynamicEntityContainer,
    atlas: ShadoTextureAtlas,
    options: ShadoDynamicEntityMeshVariantRendererOptions
  ): ShadoDynamicEntityRenderer[] {
    return options.variants.map(variant => new ShadoDynamicEntityRenderer(scene, container, atlas, {
      billboard: false,
      geometry: 'mesh',
      log: options.log,
      mesh: variant.mesh,
      meshIndex: variant.meshIndex,
      meshTexture: variant.meshTexture,
      picking: variant.picking,
      sortDrawList: options.sortDrawList,
    }));
  }

  public setAsyncPicking(options: boolean | ShadoDynamicEntityAsyncPickingOptions): void {
    this.pickingHandle?.dispose();
    const normalized = normalizePickingOptions(options);
    if (!normalized) {
      this.pickingHandle = undefined;
      return;
    }
    this.pickingHandle = installShadoDynamicEntityClickPicking(
      this.scene,
      this.mesh,
      this.container,
      normalized
    );
  }

  public pickAsync(
    pointerX = this.scene.pointerX,
    pointerY = this.scene.pointerY,
    options: ShadoDynamicEntityAsyncPickingOptions = {}
  ): Promise<ShadoDynamicEntityPickResult | null> {
    return pickShadoDynamicEntityAtPointer(
      this.scene,
      this.mesh,
      this.container,
      pointerX,
      pointerY,
      options
    );
  }

  public pickWithRay(
    ray: Ray,
    options: ShadoDynamicEntityAsyncPickingOptions = {}
  ): ShadoDynamicEntityPickResult | null {
    return pickShadoDynamicEntityWithRay(this.mesh, this.container, ray, options);
  }

  public dispose(): void {
    this.mesh.render = this.originalRender;
    this.pickingHandle?.dispose();
    this.material.dispose();
  }
}
