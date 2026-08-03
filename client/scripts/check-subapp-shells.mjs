import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const requiredText = new Map([
  [
    'src/UI/components/login/login-window.tsx',
    [
      'window.location.assign(libraUrl)',
      'window.location.assign(sandboxUrl)',
      "const libraUrl = '/apps/libra/'",
      "const sandboxUrl = '/apps/sandbox/'",
      "name    : 'Local SQLite'",
      "host    : 'local'",
      "useState<number>(0)",
      "name    : 'World Shard 1 - WebTransport'",
    ],
  ],
  [
    'src/UI/net/eq-socket.ts',
    [
      'if (url === "local" || isLocalBackendEnabled())',
      'const transportUrl = `https://${target.host}:${target.port}${target.path}`',
      'this.webtransport = new WebTransport(transportUrl',
    ],
  ],
  [
    'src/UI/components/login/login-window.js',
    ["from './login-window.tsx'"],
  ],
  [
    'src/Game/Constants/client-world-scenes.ts',
    ['export const requiredClientWorldScenes = [] as const'],
  ],
  [
    'src/Game/Manager/game-manager.ts',
    [
      'this.zoneManager?.dispose()',
      'await characterSelect.initialize()',
    ],
  ],
  [
    'src/Game/Model/shado-entity-pool.ts',
    [
      'public attachVisibilitySink(sink: RequiemEntityVisibilitySink | null): void',
      'sink.acquire(this, actor, index)',
      'this.visibilitySink?.detachPool(this)',
    ],
  ],
  [
    'src/Game/Zone/entity-pool.ts',
    [
      'await entity.initialize()',
      'this.activeRemoteMotion.set(spawnId, { snapshot, moving })',
    ],
  ],
  [
    'src/Game/Model/requiem-entity-visibility.ts',
    ['scene.updateTransformMatrix(true)'],
  ],
  [
    'src/Game/Zone/shado-world-object-layer.ts',
    [
      'const WORLD_OBJECT_PACKAGE_REVISION = "babylon-rhs-y-up-v3"',
      'revisionedObjectSource(batch.source)',
    ],
  ],
  [
    'src/Game/Zone/shado-world-scene-layer.ts',
    [
      'const WORLD_PACKAGE_REVISION = "babylon-rhs-y-up-v5-region-pvs-collision-v2"',
      'applyWorldMaterialPolicy(',
      'material.backFaceCulling = false',
      'material.twoSidedLighting = true',
      'validateRenderChunks(world, chunks)',
      'clone.alwaysSelectAsActiveMesh = persistent',
      'shadoPersistentMesh: persistent',
    ],
  ],
  ['apps/libra/index.html', ['/src/subapps/libra-main.tsx']],
  ['apps/sandbox/index.html', ['/src/subapps/sandbox-main.tsx']],
  [
    'vite.config.ts',
    [
      'const clientDependencyImporter',
      'return this.resolve(source, clientDependencyImporter, { skipSelf: true })',
      'const shaderObjectSourceRoot',
      'isSourceWithin(importer, shaderObjectSourceRoot)',
      '"@babylonjs/lite"',
      '"node_modules/@babylonjs/lite/lib/index.js"',
    ],
  ],
]);

for (const [file, expected] of requiredText) {
  const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  for (const text of expected) {
    assert.ok(source.includes(text), `${file} is missing ${JSON.stringify(text)}`);
  }
}

const gameManager = await readFile(
  new URL('../src/Game/Manager/game-manager.ts', import.meta.url),
  'utf8',
);
const characterSelectIndex = gameManager.indexOf(
  'const characterSelect = new CharacterSelect(this)',
);
assert.ok(
  characterSelectIndex >= 0 &&
    !gameManager.includes('CHARACTER_SELECT_WORLD') &&
    !gameManager.includes('loadZone("load2"'),
  'Character select must activate its owned presentation scene, not load2.',
);

const characterSelect = await readFile(
  new URL('../src/Game/Zone/character-select.ts', import.meta.url),
  'utf8',
);
assert.ok(
  !characterSelect.includes('new ZoneManager'),
  'Character select must not create a gameplay ZoneManager.',
);
const zoneManager = await readFile(
  new URL('../src/Game/Zone/zone-manager.ts', import.meta.url),
  'utf8',
);
assert.ok(
  !zoneManager.includes('dedupeMaterialsByName') &&
    !zoneManager.includes('cleanupUnusedMaterials'),
  'Zone activation must not mutate or dispose materials across asset owners.',
);
const objectCache = await readFile(
  new URL('../src/Game/Model/object-cache.ts', import.meta.url),
  'utf8',
);
assert.ok(
  objectCache.includes('private animatedMaterials = new WeakSet<BJS.Material>()') &&
    objectCache.includes('this.registerAnimatedMaterials(renderMeshes, scene)') &&
    !objectCache.includes('animatedMaterialNames'),
  'Animated object materials must be scheduled by identity in the promoted path.',
);
const entityCache = await readFile(
  new URL('../src/Game/Model/entity-cache.ts', import.meta.url),
  'utf8',
);
assert.ok(
  entityCache.includes('const extras = mesh.metadata.gltf?.extras ?? {}'),
  'Entity models without optional glTF extras must retain a renderable fallback.',
);
const worldSceneLayer = await readFile(
  new URL('../src/Game/Zone/shado-world-scene-layer.ts', import.meta.url),
  'utf8',
);
assert.ok(
  worldSceneLayer.includes('world.sourceTransform !== "mirror-x"') &&
    !worldSceneLayer.includes('runtimeRoot.scaling.x'),
  'The client world contract must not apply a second zone-scene reflection.',
);
assert.ok(
  worldSceneLayer.includes('reduceWorld(') &&
    !worldSceneLayer.includes('chunk.setIndices('),
  'Promoted scene chunks must use world visibility without mutating source index buffers.',
);
for (const generatedTwin of [
  'src/Game/Manager/game-manager.js',
  'src/Game/Model/entity-cache.js',
  'src/Game/Model/entity.js',
  'src/Game/Model/shado-entity-pool.d.ts',
  'src/Game/Model/shado-entity-pool.js',
  'src/Game/Player/player.d.ts',
  'src/Game/Player/player.js',
  'src/Game/Zone/entity-pool.d.ts',
  'src/Game/Zone/entity-pool.js',
]) {
  await assert.rejects(
    access(new URL(`../${generatedTwin}`, import.meta.url)),
    (error) => error?.code === 'ENOENT',
    `Generated twin ${generatedTwin} would shadow the current TypeScript module.`,
  );
}

console.log(
  'Server select, owned character-select scene, and bundled subapp entrypoint contracts are present.',
);
