import { strict as assert } from 'node:assert';
import test from 'node:test';

import { HandlerRegistry } from './handler-registry.js';

void test('handler registry dispatches known handlers and tracks metrics', () => {
  const registry = new HandlerRegistry<{ value: number }>();
  let seen = 0;

  registry.register(42, (ctx) => {
    seen = ctx.value;
    return true;
  });

  const handled = registry.dispatch(42, { value: 9 });
  const unknown = registry.dispatch(99, { value: 0 });

  assert.equal(handled, true);
  assert.equal(unknown, false);
  assert.equal(seen, 9);

  const metrics = registry.metrics();
  assert.equal(metrics.handled, 1);
  assert.equal(metrics.unknown, 1);
});
