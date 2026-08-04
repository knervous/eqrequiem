import * as BABYLON from '@babylonjs/core';

export type BatClip = {
  name: string;
  from: number;
  to: number;
  frames: number;
  fps: number;
};

export type BatModule = {
  name: string;
  slotIndex: number;
  variation: number;
  meshes: readonly BABYLON.Mesh[];
};

export type ModularBatStats = {
  actors: number;
  meshes: number;
  drawCalls: number;
  submittedVertices: number;
  duplicatedGeometryBytes: number;
};

export type ThinModularBatStats = {
  actors: number;
  moduleBuckets: number;
  populatedModuleBuckets: number;
  drawCalls: number;
  moduleInstances: number;
  actualThinInstances: number;
  submittedVertices: number;
  sharedGeometryBytes: number;
  instanceBufferBytes: number;
};

const BAT_VERTEX_WGSL = `
attribute position: vec3f;
attribute matricesIndices: vec4f;
attribute matricesWeights: vec4f;
attribute animData: vec4f;

uniform worldViewProjection: mat4x4f;
uniform uBatTime: f32;

var uBatTexture: texture_2d<f32>;

varying vColor: vec4f;

fn Bat_fetch(pixelIndex: i32) -> vec4f {
  let size = textureDimensions(uBatTexture);
  let x = pixelIndex % i32(size.x);
  let sourceY = pixelIndex / i32(size.x);
  let y = i32(size.y) - 1 - sourceY;
  return textureLoad(uBatTexture, vec2i(x, y), 0);
}

fn Bat_matrix(frameBase: i32, boneIndex: i32) -> mat4x4f {
  let base = frameBase + boneIndex * 4;
  return mat4x4f(
    Bat_fetch(base),
    Bat_fetch(base + 1),
    Bat_fetch(base + 2),
    Bat_fetch(base + 3)
  );
}

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let animation = vertexInputs.animData;
  let absoluteFrame = floor((uniforms.uBatTime + animation.x) * animation.w);
  let localFrame = absoluteFrame % max(1.0, animation.z);
  let frame = i32(localFrame + animation.y);
  let frameBase = frame * 428;

  let weightSum = vertexInputs.matricesWeights.x + vertexInputs.matricesWeights.y + 0.00001;
  let weight0 = vertexInputs.matricesWeights.x / weightSum;
  let weight1 = vertexInputs.matricesWeights.y / weightSum;
  let bone0 = i32(floor(vertexInputs.matricesIndices.x + 0.5));
  let bone1 = i32(floor(vertexInputs.matricesIndices.y + 0.5));
  let local = vec4f(vertexInputs.position, 1.0);
  let skinned =
    (Bat_matrix(frameBase, bone0) * local) * weight0 +
    (Bat_matrix(frameBase, bone1) * local) * weight1;

  vertexOutputs.position = uniforms.worldViewProjection * skinned;
  vertexOutputs.vColor = vec4f(0.78, 0.88, 0.81, 1.0);
}
`;

const BAT_FRAGMENT_WGSL = `
varying vColor: vec4f;

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  fragmentOutputs.color = fragmentInputs.vColor;
}
`;

const BAT_THIN_VERTEX_WGSL = `
attribute position: vec3f;
attribute matricesIndices: vec4f;
attribute matricesWeights: vec4f;
attribute animData: vec4f;
attribute world0: vec4f;
attribute world1: vec4f;
attribute world2: vec4f;
attribute world3: vec4f;

uniform worldViewProjection: mat4x4f;
uniform uBatTime: f32;

var uBatTexture: texture_2d<f32>;

varying vColor: vec4f;

fn Bat_fetch(pixelIndex: i32) -> vec4f {
  let size = textureDimensions(uBatTexture);
  let x = pixelIndex % i32(size.x);
  let sourceY = pixelIndex / i32(size.x);
  let y = i32(size.y) - 1 - sourceY;
  return textureLoad(uBatTexture, vec2i(x, y), 0);
}

fn Bat_matrix(frameBase: i32, boneIndex: i32) -> mat4x4f {
  let base = frameBase + boneIndex * 4;
  return mat4x4f(
    Bat_fetch(base),
    Bat_fetch(base + 1),
    Bat_fetch(base + 2),
    Bat_fetch(base + 3)
  );
}

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let animation = vertexInputs.animData;
  let absoluteFrame = floor((uniforms.uBatTime + animation.x) * animation.w);
  let localFrame = absoluteFrame % max(1.0, animation.z);
  let frame = i32(localFrame + animation.y);
  let frameBase = frame * 428;

  let weightSum = vertexInputs.matricesWeights.x + vertexInputs.matricesWeights.y + 0.00001;
  let weight0 = vertexInputs.matricesWeights.x / weightSum;
  let weight1 = vertexInputs.matricesWeights.y / weightSum;
  let bone0 = i32(floor(vertexInputs.matricesIndices.x + 0.5));
  let bone1 = i32(floor(vertexInputs.matricesIndices.y + 0.5));
  let local = vec4f(vertexInputs.position, 1.0);
  let skinned =
    (Bat_matrix(frameBase, bone0) * local) * weight0 +
    (Bat_matrix(frameBase, bone1) * local) * weight1;

  let instanceWorld = mat4x4f(
    vertexInputs.world0,
    vertexInputs.world1,
    vertexInputs.world2,
    vertexInputs.world3
  );
  vertexOutputs.position = uniforms.worldViewProjection * instanceWorld * skinned;
  vertexOutputs.vColor = vec4f(0.78, 0.88, 0.81, 1.0);
}
`;

function geometryBytes(mesh: BABYLON.Mesh): number {
  const arrayBytes = (data: BABYLON.FloatArray | BABYLON.IndicesArray) =>
    ArrayBuffer.isView(data) ? data.byteLength : data.length * 4;
  let bytes = 0;
  for (const kind of mesh.getVerticesDataKinds()) {
    const data = mesh.getVerticesData(kind);
    if (data) bytes += arrayBytes(data);
  }
  const indices = mesh.getIndices();
  if (indices) bytes += arrayBytes(indices);
  return bytes;
}

async function loadBatTexture(scene: BABYLON.Scene, url: string): Promise<BABYLON.Texture> {
  return new Promise((resolve, reject) => {
    const texture = new BABYLON.Texture(
      url,
      scene,
      true,
      false,
      BABYLON.Texture.NEAREST_SAMPLINGMODE,
      () => resolve(texture),
      (message, error) => reject(error ?? new Error(message)),
    );
    texture.gammaSpace = false;
    texture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
  });
}

/** Runtime-faithful baseline for the captured NM_M modular BATS implementation. */
export class ModularBatBaseline {
  public static async Create(
    scene: BABYLON.Scene,
    modules: readonly BatModule[],
    clips: readonly BatClip[],
    textureUrl = '/__nm_m_bat.exr',
  ): Promise<ModularBatBaseline> {
    if (!scene.getEngine().isWebGPU) {
      throw new Error('The modular BAT benchmark currently requires WebGPU.');
    }
    const texture = await loadBatTexture(scene, textureUrl);
    const material = new BABYLON.ShaderMaterial(
      'NM_M captured modular BAT',
      scene,
      { vertexSource: BAT_VERTEX_WGSL, fragmentSource: BAT_FRAGMENT_WGSL },
      {
        attributes: ['position', 'matricesIndices', 'matricesWeights', 'animData'],
        uniforms: ['worldViewProjection', 'uBatTime'],
        samplers: ['uBatTexture'],
        uniformBuffers: ['Scene'],
        shaderLanguage: BABYLON.ShaderLanguage.WGSL,
      },
    );
    material.backFaceCulling = true;
    material.setTexture('uBatTexture', texture);
    material.freeze();
    return new ModularBatBaseline(scene, modules, clips, texture, material);
  }

  private readonly _actorMeshes: BABYLON.Mesh[][] = [];
  private _submittedVertices = 0;
  private _duplicatedGeometryBytes = 0;
  private _clockSeconds = 0;
  private readonly _clockObserver: BABYLON.Observer<BABYLON.Scene>;

  private constructor(
    private readonly _scene: BABYLON.Scene,
    private readonly _modules: readonly BatModule[],
    private readonly _clips: readonly BatClip[],
    private readonly _texture: BABYLON.Texture,
    private readonly _material: BABYLON.ShaderMaterial,
  ) {
    this._clockObserver = _scene.onBeforeRenderObservable.add(() => {
      this._clockSeconds += _scene.getEngine().getDeltaTime() * 0.001;
      _material.setFloat('uBatTime', this._clockSeconds);
    });
  }

  public addActor(
    actorIndex: number,
    selections: readonly number[],
    position: BABYLON.Vector3,
  ): void {
    const clip = this._clips[actorIndex % this._clips.length];
    if (!clip) throw new Error('The BAT benchmark has no animation clips.');
    const actorMeshes: BABYLON.Mesh[] = [];
    for (let slotIndex = 0; slotIndex < selections.length; slotIndex++) {
      const module = this._modules.find(candidate =>
        candidate.slotIndex === slotIndex && candidate.variation === selections[slotIndex]);
      if (!module) continue;
      for (const source of module.meshes) {
        const mesh = source.clone(`CapturedBAT_${actorIndex}_${module.name}`) as BABYLON.Mesh | null;
        if (!mesh) throw new Error(`Could not clone BAT module ${module.name}.`);
        mesh.makeGeometryUnique();
        mesh.skeleton = null;
        mesh.material = this._material;
        mesh.position.copyFrom(position);
        mesh.isPickable = false;
        mesh.doNotSyncBoundingInfo = true;
        mesh.alwaysSelectAsActiveMesh = true;
        mesh.registerInstancedBuffer('animData', 4);
        mesh.instancedBuffers.animData = new BABYLON.Vector4(
          ((actorIndex * 0.61803398875) % 1) * 100,
          clip.from,
          clip.frames,
          clip.fps || 30,
        );
        mesh.setEnabled(true);
        actorMeshes.push(mesh);
        this._submittedVertices += mesh.getTotalVertices();
        this._duplicatedGeometryBytes += geometryBytes(mesh);
      }
    }
    this._actorMeshes.push(actorMeshes);
  }

  public getStats(): ModularBatStats {
    const meshes = this._actorMeshes.reduce((sum, actor) => sum + actor.length, 0);
    return {
      actors: this._actorMeshes.length,
      meshes,
      drawCalls: meshes,
      submittedVertices: this._submittedVertices,
      duplicatedGeometryBytes: this._duplicatedGeometryBytes,
    };
  }

  public dispose(): void {
    this._scene.onBeforeRenderObservable.remove(this._clockObserver);
    for (const actor of this._actorMeshes) {
      for (const mesh of actor) mesh.dispose();
    }
    this._actorMeshes.length = 0;
    this._material.dispose();
    this._texture.dispose();
  }
}

type ThinBucket = {
  mesh: BABYLON.Mesh;
  matrices: number[];
  animation: number[];
  instanceCount: number;
  geometryBytes: number;
};

/** Thin-instanced version of the captured modular BATS implementation. */
export class ThinModularBatBaseline {
  public static async Create(
    scene: BABYLON.Scene,
    modules: readonly BatModule[],
    clips: readonly BatClip[],
    textureUrl = '/__nm_m_bat.exr',
  ): Promise<ThinModularBatBaseline> {
    if (!scene.getEngine().isWebGPU) {
      throw new Error('The thin modular BAT benchmark currently requires WebGPU.');
    }
    const texture = await loadBatTexture(scene, textureUrl);
    const material = new BABYLON.ShaderMaterial(
      'NM_M thin modular BAT',
      scene,
      { vertexSource: BAT_THIN_VERTEX_WGSL, fragmentSource: BAT_FRAGMENT_WGSL },
      {
        attributes: [
          'position', 'matricesIndices', 'matricesWeights', 'animData',
        ],
        uniforms: ['worldViewProjection', 'uBatTime'],
        samplers: ['uBatTexture'],
        uniformBuffers: ['Scene'],
        shaderLanguage: BABYLON.ShaderLanguage.WGSL,
      },
    );
    material.backFaceCulling = true;
    material.setTexture('uBatTexture', texture);
    material.freeze();
    return new ThinModularBatBaseline(scene, modules, clips, texture, material);
  }

  private readonly _buckets = new Map<string, ThinBucket[]>();
  private _actors = 0;
  private _clockSeconds = 0;
  private readonly _clockObserver: BABYLON.Observer<BABYLON.Scene>;

  private constructor(
    private readonly _scene: BABYLON.Scene,
    modules: readonly BatModule[],
    private readonly _clips: readonly BatClip[],
    private readonly _texture: BABYLON.Texture,
    private readonly _material: BABYLON.ShaderMaterial,
  ) {
    for (const module of modules) {
      const buckets: ThinBucket[] = [];
      for (let primitive = 0; primitive < module.meshes.length; primitive++) {
        const source = module.meshes[primitive];
        const mesh = source.clone(`ThinBAT_${module.name}_${primitive}`) as BABYLON.Mesh | null;
        if (!mesh) throw new Error(`Could not clone thin BAT module ${module.name}.`);
        mesh.makeGeometryUnique();
        mesh.skeleton = null;
        mesh.material = _material;
        mesh.position.setAll(0);
        mesh.isPickable = false;
        mesh.doNotSyncBoundingInfo = true;
        mesh.alwaysSelectAsActiveMesh = true;
        mesh.setEnabled(false);
        buckets.push({
          mesh,
          matrices: [],
          animation: [],
          instanceCount: 0,
          geometryBytes: geometryBytes(mesh),
        });
      }
      this._buckets.set(`${module.slotIndex}:${module.variation}`, buckets);
    }
    this._clockObserver = _scene.onBeforeRenderObservable.add(() => {
      this._clockSeconds += _scene.getEngine().getDeltaTime() * 0.001;
      _material.setFloat('uBatTime', this._clockSeconds);
    });
  }

  public addActor(
    actorIndex: number,
    selections: readonly number[],
    position: BABYLON.Vector3,
  ): void {
    const clip = this._clips[actorIndex % this._clips.length];
    if (!clip) throw new Error('The thin BAT benchmark has no animation clips.');
    const matrix = BABYLON.Matrix.Translation(position.x, position.y, position.z).asArray();
    const animation = [
      ((actorIndex * 0.61803398875) % 1) * 100,
      clip.from,
      clip.frames,
      clip.fps || 30,
    ];
    for (let slotIndex = 0; slotIndex < selections.length; slotIndex++) {
      const buckets = this._buckets.get(`${slotIndex}:${selections[slotIndex]}`);
      if (!buckets) continue;
      for (const bucket of buckets) {
        bucket.matrices.push(...matrix);
        bucket.animation.push(...animation);
        bucket.instanceCount++;
      }
    }
    this._actors++;
  }

  public refresh(): ThinModularBatStats {
    for (const bucket of this._buckets.values()) {
      for (const primitive of bucket) {
        if (!primitive.instanceCount) continue;
        primitive.mesh.thinInstanceSetBuffer(
          'matrix', new Float32Array(primitive.matrices), 16, true,
        );
        primitive.mesh.thinInstanceSetBuffer(
          'animData', new Float32Array(primitive.animation), 4, true,
        );
        primitive.mesh.thinInstanceCount = primitive.instanceCount;
        primitive.mesh.setEnabled(true);
      }
    }
    return this.getStats();
  }

  public getStats(): ThinModularBatStats {
    let populatedModuleBuckets = 0;
    let drawCalls = 0;
    let moduleInstances = 0;
    let actualThinInstances = 0;
    let submittedVertices = 0;
    let sharedGeometryBytes = 0;
    for (const buckets of this._buckets.values()) {
      let populated = false;
      for (const bucket of buckets) {
        sharedGeometryBytes += bucket.geometryBytes;
        if (!bucket.instanceCount) continue;
        populated = true;
        drawCalls += Math.max(1, bucket.mesh.subMeshes.length);
        moduleInstances += bucket.instanceCount;
        actualThinInstances += bucket.mesh.thinInstanceCount;
        submittedVertices += bucket.instanceCount * bucket.mesh.getTotalVertices();
      }
      if (populated) populatedModuleBuckets++;
    }
    return {
      actors: this._actors,
      moduleBuckets: this._buckets.size,
      populatedModuleBuckets,
      drawCalls,
      moduleInstances,
      actualThinInstances,
      submittedVertices,
      sharedGeometryBytes,
      instanceBufferBytes: moduleInstances * (16 + 4) * 4,
    };
  }

  public dispose(): void {
    this._scene.onBeforeRenderObservable.remove(this._clockObserver);
    for (const buckets of this._buckets.values()) {
      for (const bucket of buckets) bucket.mesh.dispose();
    }
    this._buckets.clear();
    this._material.dispose();
    this._texture.dispose();
  }
}
