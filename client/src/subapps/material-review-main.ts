import BABYLON from "@bjs";
import { fetchShadoBytes } from "@knervous/shado/preprocess/runtime";

type ReviewPreset = {
  label: string;
  target: readonly [number, number, number];
  radius: number;
  alpha: number;
  beta: number;
};

const presets: Record<string, ReviewPreset> = {
  grass: {
    label: "Grass terrain // grass1",
    target: [-275, 0, 392],
    radius: 58,
    alpha: -2.2,
    beta: 0.42,
  },
  path: {
    label: "Fieldstone path // xdrtpat3",
    target: [-1_600, 0, 105],
    radius: 320,
    alpha: -1.75,
    beta: 0.38,
  },
  masonry: {
    label: "Fieldstone masonry // coble3",
    target: [-145, 0, 317],
    radius: 62,
    alpha: -2.4,
    beta: 0.5,
  },
  wall: {
    label: "City wall // citywal4",
    target: [-300, 30, 150],
    radius: 145,
    alpha: -2.05,
    beta: 0.72,
  },
  overview: {
    label: "Qeynos2 // clean-room material runtime preview",
    target: [-180, 10, 90],
    radius: 650,
    alpha: -2.15,
    beta: 0.82,
  },
};

const canvas = document.querySelector<HTMLCanvasElement>("#material-review");
const label = document.querySelector<HTMLElement>("#review-label");
if (!canvas || !label) throw new Error("Material review shell is incomplete");

const focus = new URLSearchParams(window.location.search).get("focus") ?? "overview";
const preset = presets[focus] ?? presets.overview;
await BABYLON.initialize();
const engine = new BABYLON.Engine(canvas, true, {
  preserveDrawingBuffer: true,
  stencil: true,
});
const scene = new BABYLON.Scene(engine);
scene.useRightHandedSystem = true;
scene.clearColor = new BABYLON.Color4(0.07, 0.085, 0.075, 1);

const camera = new BABYLON.ArcRotateCamera(
  "MaterialReviewCamera",
  preset.alpha,
  preset.beta,
  preset.radius,
  new BABYLON.Vector3(...preset.target),
  scene,
);
camera.minZ = 0.1;
camera.maxZ = 5_000;
camera.wheelDeltaPercentage = 0.01;
camera.attachControl(canvas, true);

const bytes = await fetchShadoBytes(
  `${import.meta.env.BASE_URL}eqrequiem/worlds/qeynos2.material-preview.glb.gz`,
);
const blobUrl = URL.createObjectURL(
  new Blob([bytes], { type: "model/gltf-binary" }),
);
try {
  const container = await BABYLON.LoadAssetContainerAsync(blobUrl, scene, {
    pluginExtension: ".glb",
  });
  container.addAllToScene();
  for (const material of container.materials) {
    material.backFaceCulling = false;
    if (material instanceof BABYLON.PBRMaterial) {
      material.twoSidedLighting = true;
      material.unlit = true;
    }
  }
} finally {
  URL.revokeObjectURL(blobUrl);
}

label.textContent = preset.label;
document.body.dataset.ready = "true";
engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
