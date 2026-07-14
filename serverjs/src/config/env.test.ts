import { strict as assert } from 'node:assert';
import test from 'node:test';

import { readEnv } from './env.js';

void test('readEnv applies defaults', () => {
  const env = readEnv({});

  assert.equal(env.nodeEnv, 'development');
  assert.equal(env.transport.port, 443);
  assert.equal(env.zone.tickRateHz, 20);
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
  assert.equal(env.features.navWorker, false);
  assert.equal(env.libra.enabled, false);
  assert.equal(env.libra.readonlyRuntime, false);
  assert.equal(env.libra.maxPageSize, 1000);
  assert.deepEqual(env.libra.writeAllowlist, ['content.items', 'content.npc_types']);
  assert.equal(env.libra.validationMaxIssues, 400);
});
