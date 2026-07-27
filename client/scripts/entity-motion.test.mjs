import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  correctRemotePosition,
  eqHeadingToRadians,
  predictRemotePosition,
  resolveDeadReckonedYaw,
  yawFromHorizontalMotion,
} from "../src/Game/Zone/entity-motion.ts";

function angularDifference(actual, expected) {
  return Math.atan2(Math.sin(actual - expected), Math.cos(actual - expected));
}

describe("entity movement facing", () => {
  it("maps cardinal world motion to Babylon yaw for -X-forward actors", () => {
    const cases = [
      [{ x: 1, z: 0 }, Math.PI],
      [{ x: 0, z: -1 }, -Math.PI / 2],
      [{ x: -1, z: 0 }, 0],
      [{ x: 0, z: 1 }, Math.PI / 2],
    ];
    for (const [motion, expected] of cases) {
      const yaw = yawFromHorizontalMotion(motion);
      assert.notEqual(yaw, null);
      assert.ok(Math.abs(angularDifference(yaw, expected)) < 1e-12);
    }
  });

  it("prefers observed displacement over a stale packet velocity", () => {
    assert.equal(
      resolveDeadReckonedYaw({ x: 1, z: 0 }, { x: -1, z: 0 }, 0),
      Math.PI,
    );
  });

  it("accepts zero heading and converts EQ heading units", () => {
    assert.equal(resolveDeadReckonedYaw({ x: 0, z: 0 }, { x: 0, z: 0 }, 0), 0);
    assert.equal(eqHeadingToRadians(128), Math.PI / 2);
  });
});

describe("remote entity presentation", () => {
  it("bounds extrapolation age", () => {
    const snapshot = {
      x: 1,
      y: 2,
      z: 3,
      velocityX: 10,
      velocityY: 0,
      velocityZ: -5,
      receivedAtMs: 100,
    };
    assert.deepEqual(predictRemotePosition(snapshot, 200), {
      x: 2,
      y: 2,
      z: 2.5,
    });
    assert.deepEqual(predictRemotePosition(snapshot, 10_000), {
      x: 4,
      y: 2,
      z: 1.5,
    });
  });

  it("ignores tiny errors, smooths ordinary corrections, and snaps large ones", () => {
    const current = { x: 0, y: 0, z: 0 };
    assert.equal(
      correctRemotePosition(current, { x: 0.001, y: 0, z: 0 }, 16).changed,
      false,
    );
    const smooth = correctRemotePosition(current, { x: 1, y: 0, z: 0 }, 16);
    assert.equal(smooth.snapped, false);
    assert.ok(smooth.position.x > 0 && smooth.position.x < 1);
    const snap = correctRemotePosition(current, { x: 20, y: 0, z: 0 }, 16);
    assert.equal(snap.snapped, true);
    assert.equal(snap.position.x, 20);
  });
});
