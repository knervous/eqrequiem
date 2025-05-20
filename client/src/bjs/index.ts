
interface BabylonExportObject { initialize(): Promise<void> }


type CoreAPI   = typeof import("@babylonjs/core");
type LoaderAPI = typeof import("@babylonjs/loaders/glTF/2.0");
// 2) Union them into one big API
export type BabylonAPI = CoreAPI & LoaderAPI & { initialize: () => Promise<void> };
// Create the export object
const exportObject: BabylonAPI = {
  async initialize() {
    console.log('Start');

    const importPromises = [];
    const addExports = (m) => {
      for (const [key, value] of Object.entries(m)) {
        exportObject[key] = value;
      }
    };
    const addImport = (promise) => importPromises.push(promise.then(addExports));

    // No exports
    importPromises.push(import('@babylonjs/core/Meshes/meshSimplification.js'));
    importPromises.push(import('@babylonjs/core/Meshes/meshSimplificationSceneComponent.js'));
    importPromises.push(import('@babylonjs/loaders/glTF'));
    importPromises.push(import('@babylonjs/core/Materials/Textures/Loaders/envTextureLoader'));
    importPromises.push(import('@babylonjs/core/Helpers/sceneHelpers'));
    importPromises.push(import('@babylonjs/core/Rendering/edgesRenderer'));

    // BJS exports
    addImport(import('@babylonjs/core/Materials/PBR/pbrMaterial'));
    addImport(import('@babylonjs/core/Meshes/subMesh'));
    addImport(import('@babylonjs/core/Maths/math.vector'));
    addImport(import('@babylonjs/core/Maths/math.color'));
    addImport(import('@babylonjs/core/Buffers/buffer'));
    addImport(import('@babylonjs/core/Misc/tools'));
    addImport(import('@babylonjs/core/Misc/dataReader'));
    addImport(import('@babylonjs/core/Materials/Textures/texture'));
    addImport(import('@babylonjs/core/Meshes/mesh.vertexData'));
    addImport(import('@babylonjs/core/Meshes/transformNode'));
    addImport(import('@babylonjs/core/Meshes/mesh'));
    addImport(import('@babylonjs/core/Materials/standardMaterial'));
    addImport(import('@babylonjs/core/Meshes/meshBuilder'));
    addImport(import('@babylonjs/core/Materials/Textures/dynamicTexture'));
    addImport(import('@babylonjs/core/Meshes/Builders/boxBuilder'));
    addImport(import('@babylonjs/core/Meshes/Builders/greasedLineBuilder'));
    addImport(import('@babylonjs/core/Events/pointerEvents'));
    addImport(import('@babylonjs/core/Maths/math'));
    addImport(import('@babylonjs/core/Misc/observable'));
    addImport(import('@babylonjs/core/Cameras/arcRotateCamera'));
    addImport(import('@babylonjs/core/Cameras/universalCamera'));
    addImport(import('@babylonjs/core/Engines/engine'));
    addImport(import('@babylonjs/core/Engines/thinEngine'));
    addImport(import('@babylonjs/core/Engines/webgpuEngine'));
    addImport(import('@babylonjs/core/Offline/database'));
    addImport(import('@babylonjs/core/Loading/sceneLoader'));
    addImport(import('@babylonjs/loaders/glTF/2.0'));
    addImport(import('@babylonjs/core/scene'));
    addImport(import('@babylonjs/core/Materials/Textures/cubeTexture'));
    addImport(import('@babylonjs/core/Misc/gradients'));
    addImport(import('@babylonjs/core/Layers/glowLayer'));
    addImport(import('@babylonjs/core/Materials/material'));
    addImport(import('@babylonjs/core/Materials/multiMaterial'));
    addImport(import('@babylonjs/core/Meshes/abstractMesh'));
    addImport(import('@babylonjs/core/Lights/pointLight'));
    addImport(import('@babylonjs/core/Lights/hemisphericLight'));
    addImport(import('@babylonjs/core/Lights/directionalLight'));
    addImport(import('@babylonjs/core/Culling/Octrees/octree'));
    addImport(import('@babylonjs/core/Culling/boundingInfo'));
    addImport(import('@babylonjs/core/Behaviors/Meshes/pointerDragBehavior'));
    addImport(import('@babylonjs/core/Behaviors/Cameras/autoRotationBehavior'));
    addImport(import('@babylonjs/core/Lights/light'));
    addImport(import('@babylonjs/serializers'));
    addImport(import('@babylonjs/core/Particles/particleSystem'));
    addImport(import('@babylonjs/core/Particles/particleHelper'));
    addImport(import('@babylonjs/core/Materials/effect'));
    addImport(import('@babylonjs/core/PostProcesses/postProcess'));
    addImport(import('@babylonjs/core/Animations/animation'));
    addImport(import('@babylonjs/core/Cameras/'));
    addImport(import('@babylonjs/core/Materials/effect'));

    // Engine extensions
    addImport(import('@babylonjs/core/Engines/shaderStore'));
    addImport(import('@babylonjs/core/Engines/Extensions/engine.dynamicTexture'));
    addImport(import('@babylonjs/core/Engines/WebGPU/Extensions/engine.dynamicTexture'));
    // Havok / Physics
    addImport(import('@babylonjs/core/Physics/v2/Plugins/havokPlugin'));
    addImport(import('@babylonjs/core/Physics/v2/IPhysicsEnginePlugin'));
    addImport(import('@babylonjs/core/Physics/v2/physicsShape'));
    addImport(import('@babylonjs/core/Physics/v2'));
    addImport(import('@babylonjs/core/Physics/joinedPhysicsEngineComponent'));

    await Promise.all(importPromises);
  },
} as BabylonExportObject;

if (import.meta.env.VITE_LOCAL_DEV === 'true') {
  window.BABYLON = exportObject;
}

export default exportObject;