/**
 * Runtime-only Babylon surface used by Requiem and the in-workspace Shado
 * sources. Keep this list explicit: importing Babylon's package root causes
 * browsers and production module-preload to traverse the entire engine.
 *
 * Type-only imports continue to resolve against @babylonjs/core's declarations;
 * Vite maps runtime imports of the package root to this file.
 */
// Requiem's GLSL entity shaders reference these includes directly. Register
// them before any ShaderMaterial can ask Babylon to fetch an unregistered
// `.fx` path (which a SPA dev server may otherwise answer with HTML).
import "@babylonjs/core/Shaders/ShadersInclude/bonesDeclaration.js";
import "@babylonjs/core/Shaders/ShadersInclude/bakedVertexAnimationDeclaration.js";

export { Constants } from "@babylonjs/core/Engines/constants.js";
export { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
export { Engine } from "@babylonjs/core/Engines/engine.js";
export { EngineStore } from "@babylonjs/core/Engines/engineStore.js";
export { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
export { ThinEngine } from "@babylonjs/core/Engines/thinEngine.js";
export { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine.js";
export { ShaderStore } from "@babylonjs/core/Engines/shaderStore.js";
export { WebGPUTextureHelper } from "@babylonjs/core/Engines/WebGPU/webgpuTextureHelper.js";

export { Scene, ScenePerformancePriority } from "@babylonjs/core/scene.js";
export { Node } from "@babylonjs/core/node.js";
export { AssetContainer } from "@babylonjs/core/assetContainer.js";

export {
  Matrix,
  Quaternion,
  Vector2,
  Vector3,
  Vector4,
} from "@babylonjs/core/Maths/math.vector.js";
export { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
export { Axis } from "@babylonjs/core/Maths/math.axis.js";
export { Frustum } from "@babylonjs/core/Maths/math.frustum.js";
export { Plane } from "@babylonjs/core/Maths/math.plane.js";
export { Scalar } from "@babylonjs/core/Maths/math.scalar.js";
export { Viewport } from "@babylonjs/core/Maths/math.viewport.js";

export { Animation } from "@babylonjs/core/Animations/animation.js";
export { AnimationGroup } from "@babylonjs/core/Animations/animationGroup.js";
export { AnimationRange } from "@babylonjs/core/Animations/animationRange.js";
export { BakedVertexAnimationManager } from "@babylonjs/core/BakedVertexAnimation/bakedVertexAnimationManager.js";
export { VertexAnimationBaker } from "@babylonjs/core/BakedVertexAnimation/vertexAnimationBaker.js";

export { Camera } from "@babylonjs/core/Cameras/camera.js";
export { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
export { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
export { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera.js";

export { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
export { Geometry } from "@babylonjs/core/Meshes/geometry.js";
export { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh.js";
export { LinesMesh } from "@babylonjs/core/Meshes/linesMesh.js";
export { Mesh } from "@babylonjs/core/Meshes/mesh.js";
export { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
export { SubMesh } from "@babylonjs/core/Meshes/subMesh.js";
export { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
export { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
export { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
export { StorageBuffer } from "@babylonjs/core/Buffers/storageBuffer.js";
export { ComputeShader } from "@babylonjs/core/Compute/computeShader.js";

export { Material } from "@babylonjs/core/Materials/material.js";
export { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial.js";
export { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
export { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage.js";
export { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
export { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
export { Effect } from "@babylonjs/core/Materials/effect.js";
export { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture.js";
export { ProceduralTexture } from "@babylonjs/core/Materials/Textures/Procedurals/proceduralTexture.js";
export { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture.js";
export { RawTexture2DArray } from "@babylonjs/core/Materials/Textures/rawTexture2DArray.js";
export { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
// DynamicTexture is only a class; the engine methods it calls live in these
// two extension modules, and Babylon 9 ships them side-effect-free unless the
// non-`.pure` entry is imported. Without them `new DynamicTexture(...)` throws
// `engine.createDynamicTexture is not a function`.
import "@babylonjs/core/Engines/Extensions/engine.dynamicTexture.js";
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.dynamicTexture.js";
export { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";

export { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
export { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
export { Light } from "@babylonjs/core/Lights/light.js";
export { PointLight } from "@babylonjs/core/Lights/pointLight.js";
export { GlowLayer } from "@babylonjs/core/Layers/glowLayer.js";
export { PostProcess } from "@babylonjs/core/PostProcesses/postProcess.js";

export { Bone } from "@babylonjs/core/Bones/bone.js";
export { Skeleton } from "@babylonjs/core/Bones/skeleton.js";
export { SkeletonViewer } from "@babylonjs/core/Debug/skeletonViewer.js";
export { GizmoManager } from "@babylonjs/core/Gizmos/gizmoManager.js";
export { MorphTargetManager } from "@babylonjs/core/Morph/morphTargetManager.js";

export { GPUPicker } from "@babylonjs/core/Collisions/gpuPicker.js";
export { PickingInfo } from "@babylonjs/core/Collisions/pickingInfo.js";
export { Ray } from "@babylonjs/core/Culling/ray.js";
export { KeyboardEventTypes } from "@babylonjs/core/Events/keyboardEvents.js";
export { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents.js";

export { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin.js";
export { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";
export { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
export {
  PhysicsShapeCapsule,
  PhysicsShapeMesh,
} from "@babylonjs/core/Physics/v2/physicsShape.js";
export { PhysicsRaycastResult } from "@babylonjs/core/Physics/physicsRaycastResult.js";

export { ParticleSystem } from "@babylonjs/core/Particles/particleSystem.js";
export { GPUParticleSystem } from "@babylonjs/core/Particles/gpuParticleSystem.js";

export {
  LoadAssetContainerAsync,
  SceneLoader,
} from "@babylonjs/core/Loading/sceneLoader.js";
export {
  BasisTools,
  GetInternalFormatFromBasisFormat,
} from "@babylonjs/core/Misc/basis.js";
export { FromHalfFloat, ToHalfFloat } from "@babylonjs/core/Misc/halfFloat.js";
export { Logger } from "@babylonjs/core/Misc/logger.js";
export { Tools } from "@babylonjs/core/Misc/tools.js";
