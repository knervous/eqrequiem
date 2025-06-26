
interface BabylonExportObject { initialize(): Promise<void> }


type CoreAPI   = typeof import("@babylonjs/core");
type LoaderAPI = typeof import("@babylonjs/loaders/glTF/2.0");
type MaterialsAPI = typeof import("@babylonjs/materials");
// 2) Union them into one big API
export type BabylonAPI = MaterialsAPI & CoreAPI & LoaderAPI & { initialize: () => Promise<void> };
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
    importPromises.push(import('@babylonjs/loaders/glTF'));
    importPromises.push(import('@babylonjs/loaders'));

    // Material exports
    addImport(import('@babylonjs/materials/gradient/gradientMaterial'));
  
    addImport(import('@babylonjs/serializers'));

    const b = await import('@babylonjs/core');
    await Promise.all(importPromises);
    for (const[key, entry] of Object.entries(b)) {
     
      exportObject[key] = entry;
   
    }

  },
} as BabylonExportObject;

if (import.meta.env.VITE_LOCAL_DEV === 'true') {
  window.BABYLON = exportObject;
}

export default exportObject;