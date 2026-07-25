import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader.js';
import '@babylonjs/core/Materials/colorCurves.js';
import { RegisterBabylonFileLoader } from '@babylonjs/core/Loading/Plugins/babylonFileLoader.pure.js';
import { LoadAssetContainerFromSerializedScene } from '@babylonjs/core/Loading/Plugins/babylonFileLoader.pure.js';
import { RegisterJoinedPhysicsEngineComponent } from '@babylonjs/core/Physics/joinedPhysicsEngineComponent.pure.js';
import { RegisterPhysicsV2PhysicsEngineComponent } from '@babylonjs/core/Physics/v2/physicsEngineComponent.pure.js';
import {
  NullEngine,
  Scene,
  TransformNode,
  Vector3,
} from '../src/bjs/core-runtime.ts';
import { prepareSerializedBabylonScene } from '../src/bjs/babylon-file.ts';
import {
  createHeldItemBindTransform,
  heldItemLocalYOffset,
} from '../src/Game/Model/held-item-attachment.ts';

RegisterBabylonFileLoader();
RegisterJoinedPhysicsEngineComponent();
RegisterPhysicsV2PhysicsEngineComponent();

assert.equal(
  SceneLoader.IsPluginForExtensionAvailable('.babylon'),
  true,
  'The native .babylon SceneLoader plugin is not registered.',
);
assert.equal(
  typeof Scene.prototype.getPhysicsEngine,
  'function',
  'The Scene physics implementation is not registered.',
);
assert.equal(
  typeof Scene.prototype.enablePhysics,
  'function',
  'The Scene physics implementation is not registered.',
);
assert.ok(
  Object.getOwnPropertyDescriptor(TransformNode.prototype, 'physicsBody'),
  'The Physics V2 TransformNode component is not registered.',
);

const source = JSON.stringify({
  materials: [{
    plugins: {
      DepthSensingMaterialPlugin: { name: 'DepthSensing' },
      DetailMapConfiguration: { name: 'DetailMap' },
    },
  }],
});
const prepared = prepareSerializedBabylonScene(
  new TextEncoder().encode(source).buffer,
  'sanitizer fixture',
);
assert.equal(
  prepared.materials[0].plugins.DepthSensingMaterialPlugin,
  undefined,
);
assert.ok(prepared.materials[0].plugins.DetailMapConfiguration);

for (const model of ['hum', 'huf']) {
  const compressedScene = await readFile(
    new URL(
      `../public/eqrequiem/babylon/${model}.babylon.gz`,
      import.meta.url,
    ),
  );
  const sceneData = prepareSerializedBabylonScene(
    gunzipSync(compressedScene).buffer,
    `${model}.babylon`,
  );
  const scene = new Scene(new NullEngine());
  const container = LoadAssetContainerFromSerializedScene(scene, sceneData, '');
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
  const runtimeScale =
    runtimeMesh?.metadata?.gltf?.extras?.runtimeScale;
  const skeleton = container.skeletons[0];
  skeleton.returnToRest();
  skeleton.computeAbsoluteMatrices(true);
  for (const socketName of ['socket_hand.L', 'socket_hand.R']) {
    const socket = skeleton.bones.find((bone) => bone.name === socketName);
    assert.ok(socket, `${model}.babylon is missing ${socketName}.`);
    const transform = createHeldItemBindTransform(
      socket.getAbsoluteTransform(),
      runtimeScale,
    );
    const origin = Vector3.TransformCoordinates(
      Vector3.Zero(),
      transform,
    );
    const unitX = Vector3.TransformCoordinates(
      Vector3.Right(),
      transform,
    );
    assert.ok(
      origin.lengthSquared() > 0.1,
      `${model} ${socketName} attachment remained at character origin.`,
    );
    assert.ok(
      Math.abs(Vector3.Distance(origin, unitX) * runtimeScale - 1) <
        1e-5,
      `${model} ${socketName} does not compensate for VAT runtime scale.`,
    );
  }
  assert.equal(heldItemLocalYOffset(true, 2), 0);
  assert.equal(heldItemLocalYOffset(false, 2), 1);
  container.dispose();
  scene.dispose();
}

console.log(
  'Babylon loader, Lite parser surface, sanitizer, and Physics V2 registered.',
);
