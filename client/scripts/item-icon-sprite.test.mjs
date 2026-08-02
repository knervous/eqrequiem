import assert from 'node:assert/strict';
import test from 'node:test';

import {
  generatedItemSprite,
} from '../src/UI/components/game/action-button/item-sprite.ts';

test('SQLite icon IDs unpack from column-major addresses into canonical sprite cells', () => {
  assert.deepEqual(generatedItemSprite(500), {
    url: '/eltania/items/icons/v1/sprites/dragitem1.webp',
    sheet: 1,
    column: 0,
    row: 0,
  });
  assert.deepEqual(generatedItemSprite(505), {
    url: '/eltania/items/icons/v1/sprites/dragitem1.webp',
    sheet: 1,
    column: 0,
    row: 5,
  });
  assert.deepEqual(generatedItemSprite(506), {
    url: '/eltania/items/icons/v1/sprites/dragitem1.webp',
    sheet: 1,
    column: 1,
    row: 0,
  });
  assert.deepEqual(generatedItemSprite(536), {
    url: '/eltania/items/icons/v1/sprites/dragitem2.webp',
    sheet: 2,
    column: 0,
    row: 0,
  });
  assert.equal(generatedItemSprite(499), null);
  assert.equal(generatedItemSprite(6908), null);
});
