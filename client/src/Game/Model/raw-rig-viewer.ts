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
  hum: "assets/src/models/human_male/runtime/human_male.glb",
  huf: "assets/src/models/human_female/runtime/human_female.glb",
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

  // Babylon's glTF loader wraps every import in a synthetic "__root__" node
  // carrying a (1,1,-1) scale (its right-handed -> left-handed conversion).
  // Composed through this rig's rotation-heavy spine/clavicle parent chain,
  // that mirror makes BABYLON.SkeletonViewer / bone.getAbsolutePosition()
  // report joint positions on the wrong side entirely (verified: manual FK
  // from each bone's own local translation+rotation, which IS loaded
  // correctly, exactly reproduces the source Blender rig's true joint
  // positions, while getAbsolutePosition() does not). Actual GPU skinning is
  // unaffected — it's computed through a different, correct matrix path,
  // which is why animation has always rendered correctly. So the overlay
  // below does its own forward-kinematics pass from bone-local data instead
  // of trusting Babylon's world-matrix composition for this rig.
  const skeleton = mesh.skeleton;
  const boneNames = skeleton.bones.map((bone) => bone.name);
  const fkCache = new Map<string, { pos: BJS.Vector3; rot: BJS.Quaternion }>();
  const computeBoneLocalPosition = (boneName: string): { pos: BJS.Vector3; rot: BJS.Quaternion } => {
    const cached = fkCache.get(boneName);
    if (cached) return cached;
    const bone = skeleton.bones[boneNames.indexOf(boneName)];
    const linked = bone.getTransformNode();
    const t = linked?.position ?? BABYLON.Vector3.Zero();
    const q = linked?.rotationQuaternion ?? BABYLON.Quaternion.Identity();
    const parentBone = bone.getParent();
    if (!parentBone) {
      const result = { pos: t.clone(), rot: q.clone() };
      fkCache.set(boneName, result);
      return result;
    }
    const parentResult = computeBoneLocalPosition(parentBone.name);
    const rotated = t.clone();
    rotated.rotateByQuaternionToRef(parentResult.rot, rotated);
    const result = {
      pos: parentResult.pos.add(rotated),
      rot: parentResult.rot.multiply(q),
    };
    fkCache.set(boneName, result);
    return result;
  };

  let skeletonLines: BJS.LinesMesh | null = null;
  let skeletonJointTemplate: BJS.Mesh | null = null;
  let skeletonJoints: BJS.Mesh[] = [];
  let skeletonOverlayEnabled = false;
  const disposeSkeletonOverlay = () => {
    skeletonLines?.dispose();
    skeletonLines = null;
    for (const joint of skeletonJoints) joint.dispose();
    skeletonJoints = [];
    skeletonJointTemplate?.dispose();
    skeletonJointTemplate = null;
  };
  const updateSkeletonOverlay = (displayMode: "lines" | "spheres") => {
    if (!skeletonOverlayEnabled) return;
    fkCache.clear();
    const lines: BJS.Vector3[][] = [];
    for (const bone of skeleton.bones) {
      const parentBone = bone.getParent();
      if (!parentBone) continue;
      const headPos = computeBoneLocalPosition(parentBone.name).pos;
      const tailPos = computeBoneLocalPosition(bone.name).pos;
      lines.push([headPos, tailPos]);
    }
    skeletonLines = BABYLON.MeshBuilder.CreateLineSystem(
      "raw-rig-skeleton-lines",
      { lines, instance: skeletonLines },
      scene,
    );
    skeletonLines.color = new BABYLON.Color3(1, 0.1, 0.1);
    skeletonLines.parent = mesh;
    skeletonLines.renderingGroupId = 1;

    if (displayMode === "spheres") {
      if (!skeletonJointTemplate) {
        skeletonJointTemplate = BABYLON.MeshBuilder.CreateSphere(
          "raw-rig-joint-template",
          { diameter: 1 },
          scene,
        );
        skeletonJointTemplate.setEnabled(false);
        const jointMaterial = new BABYLON.StandardMaterial("raw-rig-joint-material", scene);
        jointMaterial.emissiveColor = new BABYLON.Color3(1, 0.1, 0.1);
        jointMaterial.disableLighting = true;
        skeletonJointTemplate.material = jointMaterial;
      }
      while (skeletonJoints.length < skeleton.bones.length) {
        const clone = skeletonJointTemplate.createInstance(`raw-rig-joint-${skeletonJoints.length}`) as unknown as BJS.Mesh;
        clone.parent = mesh;
        // Rendered in group 1 (same as the bone lines) so a joint that's
        // correctly positioned *inside* the mesh volume, as real joints are,
        // isn't hidden/occluded by the surrounding flesh — always visible on
        // top for unambiguous fit checks.
        clone.renderingGroupId = 1;
        clone.scaling.setAll(0.045);
        skeletonJoints.push(clone);
      }
      skeleton.bones.forEach((bone, index) => {
        const jointMesh = skeletonJoints[index];
        jointMesh.setEnabled(true);
        jointMesh.position.copyFrom(computeBoneLocalPosition(bone.name).pos);
      });
    } else {
      for (const joint of skeletonJoints) joint.setEnabled(false);
    }
  };

  let overlayUpdateObserver: BJS.Nullable<BJS.Observer<BJS.Scene>> = null;
  const setSkeletonViewer = (enabled: boolean, displayMode: "lines" | "spheres" = "lines") => {
    overlayUpdateObserver?.remove();
    overlayUpdateObserver = null;
    disposeSkeletonOverlay();
    skeletonOverlayEnabled = enabled;
    if (!enabled || !mesh.skeleton) return;
    updateSkeletonOverlay(displayMode);
    overlayUpdateObserver = scene.onBeforeRenderObservable.add(() => updateSkeletonOverlay(displayMode));
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
      overlayUpdateObserver?.remove();
      disposeSkeletonOverlay();
      scene.dispose();
      engine.dispose();
    },
  };
}
