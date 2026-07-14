import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { movementConfirmations, planInventorySwap } from "./inventory-rules.js";

describe("shared inventory rules", () => {
  it("moves a container and its child slots as one operation", () => {
    const moves = planInventorySwap(
      [
        { slot: 22, bag: 0, itemKey: 100, containerSlots: 8 },
        { slot: 22, bag: 1, itemKey: 101 },
        { slot: 23, bag: 0, itemKey: 200 },
      ],
      { slot: 22, bag: 0 },
      { slot: 23, bag: 0 },
    );
    assert.deepEqual(moves, [
      { itemKey: 100, fromSlot: 22, fromBag: 0, slot: 23, bag: 0 },
      { itemKey: 200, fromSlot: 23, fromBag: 0, slot: 22, bag: 0 },
      { itemKey: 101, fromSlot: 22, fromBag: 1, slot: 23, bag: 1 },
    ]);
    assert.deepEqual(
      movementConfirmations(
        moves,
        { slot: 22, bag: 0 },
        { slot: 23, bag: 0 },
      ),
      [
        { fromSlot: 22, toSlot: 23, fromBag: 0, toBag: 0 },
        { fromSlot: 22, toSlot: 23, fromBag: 1, toBag: 1 },
      ],
    );
  });

  it("rejects nesting an empty container", () => {
    assert.throws(
      () => planInventorySwap(
        [{ slot: 22, bag: 0, itemKey: 100, containerSlots: 8 }],
        { slot: 22, bag: 0 },
        { slot: 23, bag: 1 },
      ),
      /cannot move a container inside another container/,
    );
  });
});
