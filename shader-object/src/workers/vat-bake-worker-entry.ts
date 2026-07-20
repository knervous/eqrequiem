import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader.js';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Bone as BabylonBone } from '@babylonjs/core/Bones/bone.pure.js';
import { Skeleton as BabylonSkeleton } from '@babylonjs/core/Bones/skeleton.js';
import { RegisterGLTFFileLoader } from '@babylonjs/loaders/glTF/glTFFileLoader.pure.js';
import { RegisterGLTF2Loader } from '@babylonjs/loaders/glTF/2.0/glTFLoader.pure.js';
import { RegisterEXT_texture_webp } from '@babylonjs/loaders/glTF/2.0/Extensions/EXT_texture_webp.pure.js';

import type {
  VATHeadlessBakeRequest,
  VATHeadlessBakeResponse,
} from '../extensions/VATBuilder/VATHeadlessBake';
import type { DQClipInfo, PackedDQVAT } from '../extensions/VATBuilder/VATBuilder';
import { detectVatMatrixScale, packVatMatrices } from '../extensions/VATBuilder/VATWorker';

const scope = self as any;
// Keep these checks executable. A `void BabylonBone` style reference is removed
// by esbuild, which can leave Babylon's circular pure-module graph with an
// uninitialized `Bone` binding inside the glTF skin loader.
if (typeof BabylonBone !== 'function' || typeof BabylonSkeleton !== 'function') {
  throw new Error('Babylon bone constructors were not initialized in the VAT bake worker');
}
RegisterGLTF2Loader();
RegisterEXT_texture_webp();
RegisterGLTFFileLoader();

function captureSkeletonPalette(mesh: any, skeleton: any, basis?: Matrix): Float32Array {
  skeleton.prepare(true);
  mesh.computeWorldMatrix(true);
  skeleton.computeAbsoluteMatrices(true);
  const palette = skeleton.getTransformMatrices(mesh) as Float32Array;
  if (!basis) return palette;
  const result = new Float32Array(palette);
  const inverseBasis = basis.clone();
  inverseBasis.invert();
  const first = new Matrix();
  const transformed = new Matrix();
  for (let bone = 0; bone < skeleton.bones.length; bone++) {
    const skin = Matrix.FromArray(palette, bone * 16);
    inverseBasis.multiplyToRef(skin, first);
    first.multiplyToRef(basis, transformed);
    transformed.copyToArray(result, bone * 16);
  }
  return result;
}

async function bake(
  scene: Scene,
  mesh: any,
  skeleton: any,
  groups: any[],
  useHalf: boolean,
  detectScale: boolean,
  paletteBasis?: Matrix
): Promise<PackedDQVAT> {
  const clips: DQClipInfo[] = [];
  let framesTotal = 0;
  for (const group of groups) {
    const from = Math.floor(group.from ?? 0);
    const to = Math.floor(group.to ?? from);
    const frames = Math.max(0, to - from + 1);
    if (!frames) continue;
    const fps = group.targetedAnimations?.[0]?.animation?.framePerSecond || 60;
    clips.push({ name: group.name, from: framesTotal, to: framesTotal + frames - 1, frames, fps });
    framesTotal += frames;
  }
  if (!clips.length) throw new Error('GLB has no selected animation frames');
  const bones = skeleton.bones.length;
  const matrices = new Float32Array(framesTotal * bones * 16);
  let row = 0;
  for (const group of groups) {
    const from = Math.floor(group.from ?? 0);
    const frames = Math.max(0, Math.floor(group.to ?? from) - from + 1);
    if (!frames) continue;
    skeleton.returnToRest();
    group.reset();
    group.play(false);
    group.pause();
    for (let frame = 0; frame < frames; frame++) {
      group.goToFrame(from + frame);
      // NullEngine has no visible GPU work, but rendering performs Babylon's
      // normal animation/linked-node synchronization used by the reference
      // baker. A temporary camera is unnecessary for this update path.
      scene.render();
      const skinPalette = captureSkeletonPalette(mesh, skeleton, paletteBasis);
      matrices.set(skinPalette.subarray(0, bones * 16), (row + frame) * bones * 16);
    }
    group.stop();
    row += frames;
  }
  const scaleInfo = detectScale
    ? detectVatMatrixScale(matrices)
    : { hasScale: false, hasAnisotropic: false };
  if (scaleInfo.hasAnisotropic) {
    throw new Error('GLB animation contains anisotropic bone scale, which rigid DQ VAT cannot represent');
  }
  const strideTexels = scaleInfo.hasScale ? 3 : 2;
  const pixels = await packVatMatrices({
    matrices,
    frames: framesTotal,
    bones,
    dqWidthBones: bones,
    tilesX: 1,
    strideTexels,
    useHalf,
    worker: false,
  });
  return {
    componentType: useHalf ? 'float16' : 'float32',
    widthTexels: bones * strideTexels,
    heightTexels: framesTotal,
    framesTotal,
    bones,
    dqWidthBones: bones,
    dqTilesX: 1,
    dqStrideTexels: strideTexels,
    dqHasScale: scaleInfo.hasScale,
    clips,
    pixels,
  };
}

scope.onmessage = async (event: MessageEvent<VATHeadlessBakeRequest>) => {
  const request = event.data;
  const engine = new NullEngine({
    renderWidth: 16,
    renderHeight: 16,
    textureSize: 16,
    deterministicLockstep: true,
    lockstepMaxSteps: 1,
  });
  const scene = new Scene(engine);
  // Scene.render() is part of the validated frame-evaluation sequence. Give
  // the NullEngine a camera so it can run that sequence without rendering to
  // the visible application canvas.
  scene.activeCamera = new FreeCamera('vat-bake-camera', Vector3.Zero(), scene);
  const objectUrl = URL.createObjectURL(new Blob([request.model], { type: 'model/gltf-binary' }));
  try {
    SceneLoader.OnPluginActivatedObservable.addOnce((plugin: any) => {
      if (plugin.name === 'gltf') plugin.skipMaterials = true;
    });
    const source = await SceneLoader.LoadAssetContainerAsync('', objectUrl, scene, undefined, '.glb');
    source.addAllToScene();
    const meshes = source.meshes.filter(mesh => mesh.getTotalVertices() > 0 && mesh.skeleton);
    const prefix = request.meshNamePrefix?.toLowerCase();
    const mesh = (prefix
      ? meshes.find(candidate => String(candidate.name).toLowerCase().startsWith(prefix))
      : undefined) ?? meshes[0];
    // A GLB may contain unused skins before the one bound to its render mesh.
    // EQ player races commonly do this, so source.skeletons[0] is not safe.
    const skeleton = mesh?.skeleton ?? source.skeletons[0];
    if (!mesh || !skeleton) throw new Error('GLB has no skinned mesh/skeleton');
    const wanted = new Set(request.clipNames?.map(name => name.toLowerCase()) ?? []);
    const selected = wanted.size
      ? source.animationGroups.filter(group => wanted.has(group.name.toLowerCase()))
      : source.animationGroups;
    const paletteBasis = request.mergeWorldSpace
      ? mesh.computeWorldMatrix(true).clone()
      : undefined;
    const packed = await bake(
      scene,
      mesh,
      skeleton,
      selected,
      request.useHalf ?? true,
      request.detectScale !== false,
      paletteBasis,
    );
    const response: VATHeadlessBakeResponse = { id: request.id, packed };
    scope.postMessage(response, [packed.pixels.buffer]);
  } catch (error) {
    const response: VATHeadlessBakeResponse = {
      id: request.id,
      error: error instanceof Error ? (error.stack || error.message) : String(error),
    };
    scope.postMessage(response);
  } finally {
    URL.revokeObjectURL(objectUrl);
    scene.dispose();
    engine.dispose();
  }
};
