import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";
import "@babylonjs/loaders/glTF/index.js";

// Rig-debug tool only: loads the accepted public GLB directly through
// Babylon's normal glTF loader and skinning, so AnimationGroups and
// SkeletonViewer reflect the real rig — unlike the Shado/VAT runtime, which
// bakes animation into a texture and never touches the Babylon skeleton
// after import. Use this to check joint-to-mesh fit, at rest or animated.
const RAW_RIG_SOURCES: Record<string, string> = {
  hum: "/eqrequiem/raw-rigs/hum.glb",
  huf: "/eqrequiem/raw-rigs/huf.glb",
  hem: "/eqrequiem/raw-rigs/hem.glb",
  hmc: "/eqrequiem/raw-rigs/hmc.glb",
  hfc: "/eqrequiem/raw-rigs/hfc.glb",
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
  const url = RAW_RIG_SOURCES[model];
  if (!url) {
    throw new Error(`No raw rig source registered for model "${model}"`);
  }

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

  // Do not reconstruct joint positions from linked-node TRS values here.
  // Babylon's glTF conversion includes a reflected import root, and omitting
  // that reflection can appear correct in a symmetric rest pose while putting
  // joints on the opposite side of an animated body. Instead, transform each
  // bind-pose joint by the exact matrix palette used for GPU skinning. This
  // keeps the diagnostic overlay in the same coordinate path as the mesh it
  // is intended to diagnose.
  const skeleton = mesh.skeleton;
  // Rendering group IDs do not clear depth automatically for later groups.
  // Clear the body's depth before group 1 so joints inside the mesh remain
  // visible; otherwise the viewer shows only the portions that protrude and
  // creates a badly biased fit diagnostic.
  scene.setRenderingAutoClearDepthStencil(1, true, true, true);
  scene.onBeforeRenderingGroupObservable.add((info) => {
    if (info.renderingGroupId === 1) {
      engine.clear(null, false, true, false);
    }
  });
  skeleton.prepare(true);
  const bindJointPositions = skeleton.bones.map((bone) =>
    bone.getAbsoluteInverseBindMatrix().clone().invert().getTranslation(),
  );
  const posedJointPositions = skeleton.bones.map(() => BABYLON.Vector3.Zero());
  const anatomicalBones = skeleton.bones.filter(
    (bone) => bone.name !== "root" && !bone.name.startsWith("socket_"),
  );
  const skinMatrix = BABYLON.Matrix.Identity();
  const updatePosedJointPositions = () => {
    skeleton.prepare(true);
    const palette = skeleton.getTransformMatrices(mesh);
    skeleton.bones.forEach((bone, index) => {
      const paletteIndex = bone.getIndex() >= 0 ? bone.getIndex() : index;
      BABYLON.Matrix.FromArrayToRef(palette, paletteIndex * 16, skinMatrix);
      BABYLON.Vector3.TransformCoordinatesToRef(
        bindJointPositions[index],
        skinMatrix,
        posedJointPositions[index],
      );
    });
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
    skeletonJointTemplate = null;
  };
  const updateSkeletonOverlay = (displayMode: "lines" | "spheres") => {
    if (!skeletonOverlayEnabled) return;
    updatePosedJointPositions();
    const lines: BJS.Vector3[][] = [];
    anatomicalBones.forEach((bone) => {
      const parentBone = bone.getParent();
      if (!parentBone || !anatomicalBones.includes(parentBone)) return;
      const index = skeleton.bones.indexOf(bone);
      const parentIndex = skeleton.bones.indexOf(parentBone);
      lines.push([posedJointPositions[parentIndex], posedJointPositions[index]]);
    });
    skeletonLines = BABYLON.MeshBuilder.CreateLineSystem(
      "raw-rig-skeleton-lines",
      // The overlay is rewritten every rendered animation frame. Babylon can
      // only update an existing line system when its vertex buffer was made
      // dynamic at creation; without this flag the debug view can retain
      // stale endpoints and draw convincing-looking spikes outside the body.
      { lines, instance: skeletonLines ?? undefined, updatable: true },
      scene,
    );
    skeletonLines.color = new BABYLON.Color3(1, 0.1, 0.1);
    if (skeletonLines.material) {
      skeletonLines.material.depthFunction = BABYLON.Constants.ALWAYS;
    }
    skeletonLines.parent = mesh;
    // The line system changes every frame; do not let a stale bounding box
    // cull an otherwise valid overlay after a deterministic animation seek.
    skeletonLines.alwaysSelectAsActiveMesh = true;
    skeletonLines.renderingGroupId = 1;

    if (displayMode === "spheres") {
      if (!skeletonJointTemplate) {
        skeletonJointTemplate = BABYLON.MeshBuilder.CreateSphere(
          "raw-rig-joint-template",
          { diameter: 1 },
          scene,
        );
        skeletonJointTemplate.renderingGroupId = 1;
        skeletonJointTemplate.alwaysSelectAsActiveMesh = true;
        skeletonJointTemplate.scaling.setAll(0.045);
        const jointMaterial = new BABYLON.StandardMaterial("raw-rig-joint-material", scene);
        jointMaterial.emissiveColor = new BABYLON.Color3(1, 0.1, 0.1);
        jointMaterial.disableLighting = true;
        jointMaterial.depthFunction = BABYLON.Constants.ALWAYS;
        skeletonJointTemplate.material = jointMaterial;
        skeletonJoints.push(skeletonJointTemplate);
      }
      while (skeletonJoints.length < anatomicalBones.length) {
        const clone = skeletonJointTemplate.createInstance(`raw-rig-joint-${skeletonJoints.length}`) as unknown as BJS.Mesh;
        clone.parent = mesh;
        // Rendered in group 1 (same as the bone lines) so a joint that's
        // correctly positioned *inside* the mesh volume, as real joints are,
        // isn't hidden/occluded by the surrounding flesh — always visible on
        // top for unambiguous fit checks.
        clone.renderingGroupId = 1;
        clone.alwaysSelectAsActiveMesh = true;
        clone.scaling.setAll(0.045);
        skeletonJoints.push(clone);
      }
      anatomicalBones.forEach((bone, index) => {
        const jointMesh = skeletonJoints[index];
        jointMesh.setEnabled(true);
        jointMesh.position.copyFrom(posedJointPositions[skeleton.bones.indexOf(bone)]);
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
