import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader.js";
import "@babylonjs/core/Materials/colorCurves.js";
import { RegisterBabylonFileLoader } from "@babylonjs/core/Loading/Plugins/babylonFileLoader.pure.js";
import { LoadAssetContainerFromSerializedScene } from "@babylonjs/core/Loading/Plugins/babylonFileLoader.pure.js";
import { RegisterJoinedPhysicsEngineComponent } from "@babylonjs/core/Physics/joinedPhysicsEngineComponent.pure.js";
import { RegisterPhysicsV2PhysicsEngineComponent } from "@babylonjs/core/Physics/v2/physicsEngineComponent.pure.js";
import {
  ComputeShader,
  NullEngine,
  Scene,
  ShaderStore,
  TransformNode,
  Vector3,
} from "../src/bjs/core-runtime.ts";
import { prepareSerializedBabylonScene } from "../src/bjs/babylon-file.ts";
import {
  createHeldItemBindTransform,
  heldItemGeometryTransform,
  heldItemLocalYOffset,
} from "../src/Game/Model/held-item-attachment.ts";

RegisterBabylonFileLoader();
RegisterJoinedPhysicsEngineComponent();
RegisterPhysicsV2PhysicsEngineComponent();

assert.equal(
  typeof ComputeShader,
  "function",
  "The explicit Babylon runtime does not expose ComputeShader for Shado.",
);
assert.equal(
  SceneLoader.IsPluginForExtensionAvailable(".babylon"),
  true,
  "The native .babylon SceneLoader plugin is not registered.",
);
assert.equal(
  typeof Scene.prototype.getPhysicsEngine,
  "function",
  "The Scene physics implementation is not registered.",
);
assert.equal(
  typeof Scene.prototype.enablePhysics,
  "function",
  "The Scene physics implementation is not registered.",
);
assert.ok(
  Object.getOwnPropertyDescriptor(TransformNode.prototype, "physicsBody"),
  "The Physics V2 TransformNode component is not registered.",
);
for (const include of ["bonesDeclaration", "bakedVertexAnimationDeclaration"]) {
  const source = ShaderStore.IncludesShadersStore[include];
  assert.ok(source, `The ${include} GLSL include is not registered.`);
  assert.equal(
    source.includes("<!DOCTYPE html>"),
    false,
    `The ${include} GLSL include was replaced by the SPA shell.`,
  );
}

const source = JSON.stringify({
  materials: [
    {
      plugins: {
        DepthSensingMaterialPlugin: { name: "DepthSensing" },
        DetailMapConfiguration: { name: "DetailMap" },
      },
    },
  ],
});
const prepared = prepareSerializedBabylonScene(
  new TextEncoder().encode(source).buffer,
  "sanitizer fixture",
);
assert.equal(
  prepared.materials[0].plugins.DepthSensingMaterialPlugin,
  undefined,
);
assert.ok(prepared.materials[0].plugins.DetailMapConfiguration);

for (const model of ["hum", "huf"]) {
  const compressedScene = await readFile(
    new URL(`../public/eqrequiem/babylon/${model}.babylon.gz`, import.meta.url),
  );
  const sceneData = prepareSerializedBabylonScene(
    gunzipSync(compressedScene).buffer,
    `${model}.babylon`,
  );
  const scene = new Scene(new NullEngine());
  const container = LoadAssetContainerFromSerializedScene(scene, sceneData, "");
  container.populateRootNodes();
  assert.equal(
    container.skeletons.length,
    1,
    `${model}.babylon does not contain exactly one skeleton.`,
  );
  assert.ok(
    container.meshes.some((mesh) => mesh.getTotalVertices() > 0),
    `The explicit runtime could not parse ${model}.babylon geometry.`,
  );
  const runtimeMesh = container.meshes.find(
    (mesh) => mesh.getTotalVertices() > 0,
  );
  const runtimeScale = runtimeMesh?.metadata?.gltf?.extras?.runtimeScale;
  const skeleton = container.skeletons[0];
  skeleton.returnToRest();
  skeleton.computeAbsoluteMatrices(true);
  for (const socketName of ["socket_hand.L", "socket_hand.R"]) {
    const socket = skeleton.bones.find((bone) => bone.name === socketName);
    assert.ok(socket, `${model}.babylon is missing ${socketName}.`);
    const transform = createHeldItemBindTransform(
      socket.getAbsoluteTransform(),
      runtimeScale,
    );
    const origin = Vector3.TransformCoordinates(Vector3.Zero(), transform);
    const unitX = Vector3.TransformCoordinates(Vector3.Right(), transform);
    assert.ok(
      origin.lengthSquared() > 0.1,
      `${model} ${socketName} attachment remained at character origin.`,
    );
    assert.ok(
      Math.abs(Vector3.Distance(origin, unitX) * runtimeScale - 1) < 1e-5,
      `${model} ${socketName} does not compensate for VAT runtime scale.`,
    );
    const attachmentKey = socketName.endsWith(".R") ? "r_point" : "l_point";
    const orientedTransform = createHeldItemBindTransform(
      socket.getAbsoluteTransform(),
      runtimeScale,
      heldItemGeometryTransform(attachmentKey),
    );
    const orientedOrigin = Vector3.TransformCoordinates(
      Vector3.Zero(),
      orientedTransform,
    );
    const orientedLengthAxis = Vector3.TransformCoordinates(
      Vector3.Right(),
      orientedTransform,
    )
      .subtract(orientedOrigin)
      .normalize();
    assert.ok(
      orientedLengthAxis.y > 0.95,
      `${model} ${socketName} weapon tip is not above its hilt.`,
    );
    assert.ok(
      Math.abs(orientedLengthAxis.x) < 0.01 && orientedLengthAxis.z > 0.2,
      `${model} ${socketName} weapon does not pitch toward player-forward +Z.`,
    );
  }
  assert.equal(heldItemLocalYOffset(true, 2), 0);
  assert.equal(heldItemLocalYOffset(false, 2), 1);
  container.dispose();
  scene.dispose();
}

const weaponOrientation = heldItemGeometryTransform("r_point");
const leftWeaponOrientation = heldItemGeometryTransform("l_point");
const shieldOrientation = heldItemGeometryTransform("shield_point");
const weaponLengthAxis = Vector3.TransformNormal(
  Vector3.Right(),
  weaponOrientation,
);
const leftWeaponLengthAxis = Vector3.TransformNormal(
  Vector3.Right(),
  leftWeaponOrientation,
);
const weaponFaceAxis = Vector3.TransformNormal(
  Vector3.Up(),
  weaponOrientation,
);
const shieldVerticalAxis = Vector3.TransformNormal(
  Vector3.Up(),
  shieldOrientation,
);
assert.ok(
  weaponLengthAxis.z > 0.95 && weaponLengthAxis.y > 0.2,
  "Right-hand weapon is not aligned upward and forward at the socket.",
);
assert.ok(
  Vector3.Distance(weaponLengthAxis, leftWeaponLengthAxis) < 1e-5,
  "Left-hand weapon does not share the right-hand forward/up alignment.",
);
assert.ok(
  weaponFaceAxis.y > 0.95,
  "Weapon broad side remains edge-on instead of facing laterally from the socket.",
);
assert.ok(
  Vector3.Distance(shieldVerticalAxis, Vector3.Forward()) < 1e-5,
  "Shield face does not remain vertical at the canonical socket.",
);
assert.ok(
  Vector3.TransformCoordinates(Vector3.Zero(), shieldOrientation).x < -0.8,
  "Shield center is not offset outward from the canonical palm socket.",
);

console.log(
  "Babylon loader, Lite parser surface, sanitizer, and Physics V2 registered.",
);
