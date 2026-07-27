import assert from "node:assert/strict";
import test from "node:test";

import {
  merchantBuyPrice,
  merchantSellPrice,
} from "./merchant-pricing.js";

test("merchant quotes are deterministic integer copper values", () => {
  const policy = {
    sellToPlayerPermille: 1_100,
    buyFromPlayerPermille: 500,
    minimumTransactionCopper: 1,
  };
  const item = { basePrice: 101, sellRatePermille: 1_250 };
  assert.equal(merchantSellPrice(item, 2, policy), 278);
  assert.equal(merchantBuyPrice(item, 2, policy), 102);
});

test("merchant pricing clamps free legacy items to the configured minimum", () => {
  const policy = {
    sellToPlayerPermille: 1_000,
    buyFromPlayerPermille: 1_000,
    minimumTransactionCopper: 1,
  };
  assert.equal(
    merchantSellPrice({ basePrice: 0, sellRatePermille: 1_000 }, 3, policy),
    3,
  );
});
