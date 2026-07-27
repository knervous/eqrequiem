import { strict as assert } from 'node:assert';
import test from 'node:test';

import { readEnv } from './env.js';

void test('readEnv applies defaults', () => {
  const env = readEnv({});

  assert.equal(env.nodeEnv, 'development');
  assert.equal(env.transport.port, 443);
  assert.equal(env.zone.tickRateHz, 20);
  assert.equal(env.zone.npcEngagement.repathIntervalMs, 500);
  assert.equal(env.zone.npcEngagement.targetMovementRepathDistance, 1.5);
  assert.equal(env.nav.meshDir, '../server/maps');
  assert.equal(env.nav.worldPackageDir, '../client/public/eqrequiem/worlds');
  assert.equal(env.nav.queryTimeoutMs, 2000);
  assert.equal(env.nav.maxNodes, 4096);
  assert.equal(env.features.navWorker, true);
  assert.equal(env.libra.enabled, true);
  assert.equal(env.libra.readonlyRuntime, true);
  assert.deepEqual(env.libra.writeAllowlist, ['*']);
});

void test('readEnv accepts explicit values', () => {
  const env = readEnv({
    NODE_ENV: 'production',
    WT_PORT: '443',
    ZONE_TICK_RATE_HZ: '30',
    NPC_DAMAGE_HATE_MULTIPLIER: '2',
    NPC_REPATH_INTERVAL_MS: '250',
    NPC_DIRECT_MOVEMENT_WHILE_PATH_PENDING: 'false',
    NAV_MESH_DIR: './test-nav',
    WORLD_PACKAGE_DIR: './test-worlds',
    NAV_QUERY_TIMEOUT_MS: '750',
    NAV_QUERY_MAX_NODES: '2048',
    FEATURE_NAV_WORKER: 'false',
    LIBRA_ENABLED: 'false',
    LIBRA_READONLY_RUNTIME: 'false',
    LIBRA_MAX_PAGE_SIZE: '1000',
    LIBRA_WRITE_ALLOWLIST: 'content.items, content.npc_types',
    LIBRA_VALIDATION_MAX_ISSUES: '400',
  });

  assert.equal(env.nodeEnv, 'production');
  assert.equal(env.transport.port, 443);
  assert.equal(env.zone.tickRateHz, 30);
  assert.equal(env.zone.npcEngagement.damageHateMultiplier, 2);
  assert.equal(env.zone.npcEngagement.repathIntervalMs, 250);
  assert.equal(env.zone.npcEngagement.directMovementWhilePathPending, false);
  assert.equal(env.nav.meshDir, './test-nav');
  assert.equal(env.nav.worldPackageDir, './test-worlds');
  assert.equal(env.nav.queryTimeoutMs, 750);
  assert.equal(env.nav.maxNodes, 2048);
  assert.equal(env.features.navWorker, false);
  assert.equal(env.libra.enabled, false);
  assert.equal(env.libra.readonlyRuntime, false);
  assert.equal(env.libra.maxPageSize, 1000);
  assert.deepEqual(env.libra.writeAllowlist, ['content.items', 'content.npc_types']);
  assert.equal(env.libra.validationMaxIssues, 400);
});
