import * as BABYLON from "@babylonjs/core";
import type * as BJS from "@babylonjs/core";
import "@babylonjs/loaders/glTF/index.js";

// Injected by serverjs/libra-ui/vite.config.ts (dev-only). Lets this module
// fetch pipeline source GLBs directly via Vite's /@fs/ static serving instead
// of duplicating them into client/public.
declare const __REPO_ROOT__: string;

// Rig-debug tool only: loads the pipeline's source GLB directly through
// Babylon's normal glTF loader and skinning, so AnimationGroups and
// SkeletonViewer reflect the real rig — unlike the Shado/VAT runtime, which
// bakes animation into a texture and never touches the Babylon skeleton
// after import. Use this to check joint-to-mesh fit, at rest or animated.
const RAW_RIG_SOURCES: Record<string, string> = {
  hum: "assets/src/models/human_male/eqref/human_male_locomotion_v11_pbr.glb",
  huf: "assets/src/models/human_female/eqref/human_female_locomotion_v12_pbr.glb",
  hmc: "assets/src/models/comfyui_humans/male/male_comfy_pbr.glb",
  hfc: "assets/src/models/comfyui_humans/female/female_comfy_pbr.glb",
};

export function getRawRigModelKeys(): string[] {
  return Object.keys(RAW_RIG_SOURCES);
}

export type RawRigViewerOptions = {
  model?: string;
  onFrame?: (fps: number) => void;
  onStatus?: (status: string) => void;
};

export type RawRigViewer = {
  animations: string[];
  mesh: BJS.Mesh;
  playAnimation: (name: string) => void;
  setWireframe: (enabled: boolean) => void;
  setSkeletonViewer: (enabled: boolean, displayMode?: "lines" | "spheres") => void;
  resetCamera: () => void;
  dispose: () => void;
};

export async function createRawRigViewer(
  canvas: HTMLCanvasElement,
  options: RawRigViewerOptions = {},
): Promise<RawRigViewer> {
  const model = (options.model ?? "hum").toLowerCase();
  const relativePath = RAW_RIG_SOURCES[model];
  if (!relativePath) {
    throw new Error(`No raw rig source registered for model "${model}"`);
  }
  const url = `/@fs/${__REPO_ROOT__}/${relativePath}`;

  const engine = new BABYLON.Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
  });
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.035, 0.055, 0.075, 1);
  const camera = new BABYLON.ArcRotateCamera(
    "raw-rig-camera",
    -Math.PI / 2,
    Math.PI / 2.3,
    10,
    new BABYLON.Vector3(0, 3, 0),
    scene,
  );
  camera.wheelDeltaPercentage = 0.01;
  camera.attachControl(canvas, true);
  let fitRadius = 10;
  const fitTarget = new BABYLON.Vector3(0, 3, 0);
  const resetCamera = () => {
    camera.alpha = -Math.PI / 2;
    camera.beta = Math.PI / 2.3;
    camera.radius = fitRadius;
    camera.target.copyFrom(fitTarget);
  };
  new BABYLON.HemisphericLight("raw-rig-light", new BABYLON.Vector3(0, 1, 0), scene);

  options.onStatus?.("Loading raw rig GLB...");
  const container = await BABYLON.LoadAssetContainerAsync(url, scene, {
    pluginExtension: ".glb",
  });
  container.addAllToScene();

  const mesh = container.meshes.find(
    (candidate) => candidate.getTotalVertices() > 0,
  ) as BJS.Mesh | undefined;
  if (!mesh) throw new Error(`${model} raw rig has no renderable geometry`);
  if (!mesh.skeleton) throw new Error(`${model} raw rig has no skeleton`);

  for (const group of container.animationGroups) group.stop();

  // The raw GLB is at its authored scale/origin, not the Shado runtime's
  // normalized height — fit the camera to it instead of assuming a size.
  mesh.computeWorldMatrix(true);
  const bounds = mesh.getBoundingInfo().boundingBox;
  const fitHeight = bounds.maximumWorld.y - bounds.minimumWorld.y;
  fitTarget.copyFrom(bounds.centerWorld);
  fitRadius = fitHeight * 2;
  camera.lowerRadiusLimit = fitHeight * 0.5;
  camera.upperRadiusLimit = fitHeight * 6;
  resetCamera();

  let skeletonViewer: BJS.SkeletonViewer | null = null;
  const setSkeletonViewer = (enabled: boolean, displayMode: "lines" | "spheres" = "lines") => {
    skeletonViewer?.dispose();
    skeletonViewer = null;
    if (!enabled || !mesh.skeleton) return;
    skeletonViewer = new BABYLON.SkeletonViewer(mesh.skeleton, mesh, scene, false, 3, {
      displayMode: displayMode === "spheres"
        ? BABYLON.SkeletonViewer.DISPLAY_SPHERE_AND_SPURS
        : BABYLON.SkeletonViewer.DISPLAY_LINES,
    });
    skeletonViewer.isEnabled = true;
    skeletonViewer.color = new BABYLON.Color3(1, 0.1, 0.1);
  };

  let activeGroup: BJS.AnimationGroup | null = null;
  const playAnimation = (name: string) => {
    const group = container.animationGroups.find((candidate) => candidate.name === name);
    if (!group) throw new Error(`Unknown animation: ${name}`);
    activeGroup?.stop();
    activeGroup = group;
    // Real playback via play()+loop, ticked by the normal render loop — unlike
    // manual goToFrame() seeks, this doesn't fight Babylon's own elapsed-time
    // animatable clock (see install-human-model.js for that pitfall).
    group.play(true);
  };

  const material = mesh.material as BJS.StandardMaterial | BJS.PBRMaterial | null;
  const setWireframe = (enabled: boolean) => {
    if (material) material.wireframe = enabled;
  };

  options.onStatus?.("Raw rig preview (real skeleton, no VAT)");
  engine.runRenderLoop(() => {
    scene.render();
  });
  let lastSample = performance.now();
  let frames = 0;
  scene.onAfterRenderObservable.add(() => {
    frames++;
    const now = performance.now();
    if (now - lastSample >= 500) {
      options.onFrame?.((frames * 1000) / (now - lastSample));
      lastSample = now;
      frames = 0;
    }
  });
  const resize = () => engine.resize();
  window.addEventListener("resize", resize);

  return {
    animations: container.animationGroups.map((group) => group.name),
    mesh,
    playAnimation,
    setWireframe,
    setSkeletonViewer,
    resetCamera,
    dispose: () => {
      window.removeEventListener("resize", resize);
      engine.stopRenderLoop();
      skeletonViewer?.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
