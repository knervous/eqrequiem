import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";
import {
  createGrassMaterial,
  createGrassPatch,
  createWaterMaterial,
} from "./index";
import { bindZoneShaderLighting } from "./zone-shader-lighting";
import "./proving-ground.css";

const canvas = document.querySelector<HTMLCanvasElement>("#fx-canvas");
const status = document.querySelector<HTMLElement>("#fx-status");
const metrics = document.querySelector<HTMLElement>("#fx-metrics");
if (!canvas || !status || !metrics) {
  throw new Error("FX proving-ground shell is incomplete");
}

if (!navigator.gpu || !(await BABYLON.WebGPUEngine.IsSupportedAsync)) {
  status.textContent = "WebGPU unavailable";
  status.dataset.state = "error";
  throw new Error("This proving ground requires a WebGPU-capable browser");
}

const engine = new BABYLON.WebGPUEngine(canvas, {
  antialias: true,
  adaptToDeviceRatio: true,
});
await engine.initAsync();

const scene = new BABYLON.Scene(engine);
scene.useRightHandedSystem = true;
scene.clearColor = new BABYLON.Color4(0.018, 0.025, 0.029, 1);
scene.ambientColor = new BABYLON.Color3(0.12, 0.14, 0.12);

const camera = new BABYLON.ArcRotateCamera(
  "FxCamera",
  -1.22,
  1.04,
  31,
  new BABYLON.Vector3(0, 0.4, 0),
  scene,
);
camera.lowerRadiusLimit = 14;
camera.upperRadiusLimit = 46;
camera.lowerBetaLimit = 0.35;
camera.upperBetaLimit = 1.48;
camera.wheelDeltaPercentage = 0.01;
camera.attachControl(canvas, true);

const light = new BABYLON.HemisphericLight(
  "FxFill",
  new BABYLON.Vector3(0.25, 0.9, 0.32),
  scene,
);
light.intensity = 0.62;
light.groundColor = new BABYLON.Color3(0.055, 0.07, 0.065);

const grassGround = BABYLON.MeshBuilder.CreateGround(
  "GrassGround",
  { width: 16, height: 14 },
  scene,
);
grassGround.position.x = -8.75;
const grassGroundMaterial = new BABYLON.StandardMaterial("GrassGroundBase", scene);
grassGroundMaterial.diffuseColor = new BABYLON.Color3(0.055, 0.105, 0.043);
grassGroundMaterial.specularColor = BABYLON.Color3.Black();
grassGround.material = grassGroundMaterial;
grassGround.freezeWorldMatrix();

const grass = createGrassPatch(scene, {
  width: 16,
  depth: 14,
  columns: 72,
  rows: 64,
});
grass.position.x = grassGround.position.x;
grass.position.y = 0.012;
grass.unfreezeWorldMatrix();
grass.freezeWorldMatrix();
const grassMaterial = createGrassMaterial(scene);
grass.material = grassMaterial;

const waterBed = BABYLON.MeshBuilder.CreateGround(
  "WaterBed",
  { width: 16, height: 14 },
  scene,
);
waterBed.position.x = 8.75;
waterBed.position.y = -0.32;
const waterBedMaterial = new BABYLON.StandardMaterial("WaterBedMaterial", scene);
waterBedMaterial.diffuseColor = new BABYLON.Color3(0.07, 0.11, 0.095);
waterBedMaterial.specularColor = BABYLON.Color3.Black();
waterBed.material = waterBedMaterial;
waterBed.freezeWorldMatrix();

const water = BABYLON.MeshBuilder.CreateGround(
  "WaterSurface",
  { width: 16, height: 14, subdivisions: 96, updatable: false },
  scene,
);
water.position.x = waterBed.position.x;
water.freezeWorldMatrix();
const waterMaterial = createWaterMaterial(scene);
water.material = waterMaterial;
bindZoneShaderLighting(scene, [grassMaterial, waterMaterial]);

const divider = BABYLON.MeshBuilder.CreateBox(
  "StoneDivider",
  { width: 1.1, height: 0.55, depth: 15 },
  scene,
);
const dividerMaterial = new BABYLON.StandardMaterial("DividerMaterial", scene);
dividerMaterial.diffuseColor = new BABYLON.Color3(0.19, 0.2, 0.18);
dividerMaterial.specularColor = new BABYLON.Color3(0.04, 0.04, 0.035);
divider.material = dividerMaterial;
divider.position.y = 0.12;
divider.freezeWorldMatrix();

let compiledShaders = 0;
const shaderCompiled = () => {
  compiledShaders++;
  if (compiledShaders === 2) {
    status.textContent = "Native WGSL compiled";
    status.dataset.state = "ready";
    document.body.dataset.ready = "true";
  }
};
const shaderFailed = (_effect: BJS.Effect, errors: string) => {
  status.textContent = "WGSL compile failed";
  status.dataset.state = "error";
  console.error("[requiem/fx] shader compilation failed", errors);
};
grassMaterial.onCompiled = shaderCompiled;
grassMaterial.onError = shaderFailed;
waterMaterial.onCompiled = shaderCompiled;
waterMaterial.onError = shaderFailed;

const startedAt = performance.now();
let metricAccumulator = 0;
scene.onBeforeRenderObservable.add(() => {
  const elapsedSeconds = (performance.now() - startedAt) / 1_000;
  grassMaterial.setFloat("uTime", elapsedSeconds);
  waterMaterial.setFloat("uTime", elapsedSeconds);
  waterMaterial.setVector3("uEyePosition", camera.globalPosition);
  bindZoneShaderLighting(scene, [grassMaterial, waterMaterial]);
  metricAccumulator += engine.getDeltaTime();
  if (metricAccumulator >= 500) {
    metricAccumulator = 0;
    metrics.textContent =
      `${engine.getFps().toFixed(0)} FPS · ` +
      `${grass.getTotalVertices().toLocaleString()} grass vertices · ` +
      `${water.getTotalVertices().toLocaleString()} water vertices · 2 FX draws`;
  }
});

function bindRange(
  id: string,
  callback: (value: number) => void,
): void {
  const input = document.querySelector<HTMLInputElement>(`#${id}`);
  if (!input) throw new Error(`Missing FX control ${id}`);
  input.addEventListener("input", () => callback(Number(input.value)));
}

bindRange("wind-strength", (value) => {
  grassMaterial.setFloat("uWindStrength", value);
});
bindRange("wave-strength", (value) => {
  waterMaterial.setFloat("uWaveStrength", value);
});
bindRange("ripple-strength", (value) => {
  waterMaterial.setFloat("uRippleStrength", value);
});

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
window.addEventListener("beforeunload", () => engine.dispose(), { once: true });
