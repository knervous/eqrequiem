// The player capsule is a velocity-driven Havok body, so "standing on a slope"
// is a decision the controller makes, not something the solver produces on its
// own. These tests drive the real ground contract against a real Havok world.
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { before, describe, it } from "node:test";

import {
  GROUND_FRICTION,
  GROUND_PROBE_EPSILON,
  MAX_GROUND_STICK_SPEED,
  MAX_WALKABLE_SLOPE_DEGREES,
  groundContactDistance,
  groundRestDistance,
  groundStickSpeed,
  isWalkableSlope,
  projectVelocityOnGround,
} from "../src/Game/Physics/ground.ts";

const clientRoot = path.resolve(import.meta.dirname, "..");
const havokRoot = path.join(clientRoot, "node_modules/@babylonjs/havok/lib/esm");

// Matches GameManager.loadPhysicsEngine and Entity.setupPhysics.
const WORLD_GRAVITY_Y = -9.81 * 30;
const FRAME_SECONDS = 1 / 60;
const CAPSULE_HEIGHT = 6;
const CAPSULE_RADIUS = 2;
const MOVE_SPEED = 20;

let BABYLON;
let HK;

before(async () => {
  BABYLON = await import(
    path.join(clientRoot, "node_modules/@babylonjs/core/index.js")
  );
  const havokFactory = (
    await import(path.join(havokRoot, "HavokPhysics_es.js"))
  ).default;
  HK = await havokFactory({
    wasmBinary: fs.readFileSync(path.join(havokRoot, "HavokPhysics.wasm")),
  });
});

/** A single tilted quad, built the way the world collision streamer builds chunks. */
function createSlope(scene, degrees, applyMaterial = true) {
  const rise = Math.tan((degrees * Math.PI) / 180);
  const extent = 400;
  const positions = [];
  for (const [x, z] of [
    [-extent, -extent],
    [extent, -extent],
    [extent, extent],
    [-extent, extent],
  ]) {
    positions.push(x, x * rise, z);
  }
  const mesh = new BABYLON.Mesh("slope", scene);
  mesh.setVerticesData(BABYLON.VertexBuffer.PositionKind, positions, false, 3);
  mesh.setIndices([0, 1, 2, 0, 2, 3], null, false);
  mesh.isVisible = false;
  mesh.freezeWorldMatrix();

  const body = new BABYLON.PhysicsBody(
    mesh,
    BABYLON.PhysicsMotionType.STATIC,
    false,
    scene,
  );
  const shape = new BABYLON.PhysicsShapeMesh(mesh, scene);
  body.shape = shape;
  if (applyMaterial) shape.material = groundMaterial();
  body.setMassProperties({ mass: 0 });
  mesh.physicsBody = body;
  return { mesh, body, shape };
}

function groundMaterial() {
  return {
    friction: GROUND_FRICTION,
    staticFriction: GROUND_FRICTION,
    restitution: 0,
    frictionCombine: BABYLON.PhysicsMaterialCombineMode.MAXIMUM,
    restitutionCombine: BABYLON.PhysicsMaterialCombineMode.MINIMUM,
  };
}

function createPlayer(scene, applyMaterial = true) {
  const half = CAPSULE_HEIGHT / 2 - CAPSULE_RADIUS;
  const shape = new BABYLON.PhysicsShapeCapsule(
    new BABYLON.Vector3(0, half, 0),
    new BABYLON.Vector3(0, -half, 0),
    CAPSULE_RADIUS,
    scene,
  );
  const node = new BABYLON.TransformNode("player", scene);
  const body = new BABYLON.PhysicsBody(
    node,
    BABYLON.PhysicsMotionType.DYNAMIC,
    false,
    scene,
  );
  body.setAngularVelocity(BABYLON.Vector3.Zero());
  body.setAngularDamping(1);
  body.setLinearDamping(0.9);
  body.shape = shape;
  if (applyMaterial) shape.material = groundMaterial();
  body.setMassProperties({ mass: 5, inertia: new BABYLON.Vector3(0, 0, 0) });
  return { node, body, shape };
}

/**
 * Runs the controller's ground handling against a real Havok slope.
 * `move` is the desired horizontal velocity, matching what movementTick feeds
 * the body once input has been resolved.
 */
function simulate({
  degrees,
  seconds = 5,
  move = null,
  legacyController = false,
  defaultMaterials = false,
}) {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const plugin = new BABYLON.HavokPlugin(true, HK);
  scene.enablePhysics(new BABYLON.Vector3(0, WORLD_GRAVITY_Y, 0), plugin);

  createSlope(scene, degrees, !defaultMaterials);
  const player = createPlayer(scene, !defaultMaterials);

  const cos = Math.cos((degrees * Math.PI) / 180);
  plugin._hknp.HP_Body_SetPosition(player.body._pluginData.hpBodyId, [
    0,
    CAPSULE_RADIUS / cos + (CAPSULE_HEIGHT / 2 - CAPSULE_RADIUS),
    0,
  ]);
  player.body.setLinearVelocity(BABYLON.Vector3.Zero());

  const physics = scene.getPhysicsEngine();
  const result = new BABYLON.PhysicsRaycastResult();
  const baseline = CAPSULE_HEIGHT / 2 + GROUND_PROBE_EPSILON;
  let gravityFactor = 1;

  const sampleGround = () => {
    const origin = player.node.position;
    result.reset();
    plugin.raycast(
      origin,
      new BABYLON.Vector3(origin.x, origin.y - CAPSULE_HEIGHT, origin.z),
      result,
      { collideWith: 0x00000dad1, ignoreBody: player.body },
    );
    const hit = result.body;
    if (!hit || hit.motionType !== BABYLON.PhysicsMotionType.STATIC) {
      return { gap: 0, grounded: false, walkable: false, normal: { x: 0, y: 1, z: 0 } };
    }
    const normal = result.hitNormalWorld;
    if (normal.y <= 0) {
      return { gap: 0, grounded: false, walkable: false, normal };
    }
    const rest = groundRestDistance(
      CAPSULE_HEIGHT / 2,
      CAPSULE_RADIUS,
      normal.y,
    );
    return {
      gap: Math.max(0, result.hitDistance - rest),
      grounded:
        result.hitDistance <= groundContactDistance(baseline, normal.y),
      walkable: isWalkableSlope(normal.y),
      normal,
    };
  };

  // Let the capsule settle onto the surface before anything is measured; the
  // node transform only mirrors the body once the world has stepped.
  const settleFrames = 12;
  const frames = Math.round(seconds / FRAME_SECONDS);
  let start = player.node.position.clone();
  for (let frame = 0; frame < settleFrames + frames; frame++) {
    if (frame === settleFrames) start = player.node.position.clone();
    const input = frame >= settleFrames ? move : null;
    const ground = sampleGround();
    const velocity = player.body.getLinearVelocity();

    if (legacyController) {
      // What the controller did before: horizontal input only, vertical left to
      // the simulation and pinned to zero while the probe reports contact.
      player.body.setLinearVelocity(
        new BABYLON.Vector3(
          input?.x ?? 0,
          ground.grounded ? Math.min(velocity.y, 0) : velocity.y,
          input?.z ?? 0,
        ),
      );
    } else if (ground.grounded && ground.walkable) {
      if (gravityFactor !== 0) {
        gravityFactor = 0;
        player.body.setGravityFactor(0);
      }
      const stick = groundStickSpeed(ground.gap, FRAME_SECONDS);
      const next = { x: 0, y: -stick, z: 0 };
      if (input) {
        projectVelocityOnGround(input, ground.normal, stick, next);
      }
      player.body.setLinearVelocity(
        new BABYLON.Vector3(next.x, next.y, next.z),
      );
    } else {
      if (gravityFactor !== 1) {
        gravityFactor = 1;
        player.body.setGravityFactor(1);
      }
      player.body.setLinearVelocity(
        new BABYLON.Vector3(
          input?.x ?? 0,
          Math.max(velocity.y, -9.8 * 1.5),
          input?.z ?? 0,
        ),
      );
    }
    physics._step(FRAME_SECONDS);
  }

  const end = player.node.position.clone();
  engine.dispose();
  return {
    drift: Math.hypot(end.x - start.x, end.z - start.z),
    climb: end.y - start.y,
    travelX: end.x - start.x,
  };
}

describe("ground contract", () => {
  it("keeps projected movement on the slope plane at the requested speed", () => {
    const degrees = 30;
    const radians = (degrees * Math.PI) / 180;
    const normal = { x: -Math.sin(radians), y: Math.cos(radians), z: 0 };
    const out = { x: 0, y: 0, z: 0 };
    projectVelocityOnGround({ x: MOVE_SPEED, y: 0, z: 0 }, normal, 0, out);

    assert.ok(Math.abs(Math.hypot(out.x, out.y, out.z) - MOVE_SPEED) < 1e-9);
    // Uphill motion climbs, and nothing is pushed through the surface.
    assert.ok(out.y > 0);
    assert.ok(Math.abs(out.x * normal.x + out.y * normal.y) < 1e-9);
  });

  it("pulls down only the gap that is actually there", () => {
    // At rest the pull is nothing, so friction never taxes walking speed.
    assert.equal(groundStickSpeed(0, FRAME_SECONDS), 0);
    assert.equal(groundStickSpeed(-1, FRAME_SECONDS), 0);
    // A small gap closes within one frame; a large one is capped.
    assert.ok(Math.abs(groundStickSpeed(0.05, FRAME_SECONDS) - 3) < 1e-9);
    assert.equal(groundStickSpeed(10, FRAME_SECONDS), MAX_GROUND_STICK_SPEED);

    const out = { x: 0, y: 0, z: 0 };
    projectVelocityOnGround(
      { x: MOVE_SPEED, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      2,
      out,
    );
    assert.equal(out.x, MOVE_SPEED);
    assert.equal(out.y, -2);
  });

  it("measures the resting probe distance from the capsule geometry", () => {
    const halfHeight = CAPSULE_HEIGHT / 2;
    assert.equal(groundRestDistance(halfHeight, CAPSULE_RADIUS, 1), halfHeight);
    const cos45 = Math.cos(Math.PI / 4);
    assert.ok(
      Math.abs(
        groundRestDistance(halfHeight, CAPSULE_RADIUS, cos45) -
          (halfHeight - CAPSULE_RADIUS + CAPSULE_RADIUS / cos45),
      ) < 1e-9,
    );
  });

  it("draws the walkable line at the documented angle", () => {
    const cosAt = (deg) => Math.cos((deg * Math.PI) / 180);
    assert.ok(isWalkableSlope(cosAt(MAX_WALKABLE_SLOPE_DEGREES - 1)));
    assert.ok(!isWalkableSlope(cosAt(MAX_WALKABLE_SLOPE_DEGREES + 1)));
  });

  it("grows the contact distance the way a capsule rises on a slope", () => {
    assert.equal(groundContactDistance(3.1, 1), 3.1);
    const cos45 = Math.cos(Math.PI / 4);
    assert.ok(Math.abs(groundContactDistance(3.1, cos45) - 3.1 / cos45) < 1e-9);
  });
});

describe("standing on a slope in Havok", () => {
  for (const degrees of [15, 30, 45, 54]) {
    it(`holds position on a ${degrees} degree slope`, () => {
      const { drift } = simulate({ degrees });
      assert.ok(
        drift < 0.1,
        `expected the capsule to stay put, drifted ${drift.toFixed(3)}`,
      );
    });
  }

  it("still slides down ground steeper than the walkable limit", () => {
    const { drift } = simulate({ degrees: 70 });
    assert.ok(drift > 1, `expected a slide, drifted ${drift.toFixed(3)}`);
  });

  it("walks flat ground at speed without sinking into it", () => {
    const flat = simulate({
      degrees: 0,
      seconds: 1,
      move: { x: MOVE_SPEED, y: 0, z: 0 },
    });
    assert.ok(
      Math.abs(flat.travelX - MOVE_SPEED) < 0.5,
      `expected ~${MOVE_SPEED} units of travel, got ${flat.travelX.toFixed(3)}`,
    );
    assert.ok(
      Math.abs(flat.climb) < 0.2,
      `expected level ground to stay level, moved ${flat.climb.toFixed(3)}`,
    );
  });

  it("walks up a slope without being dragged back down", () => {
    const uphill = simulate({
      degrees: 30,
      seconds: 1,
      move: { x: MOVE_SPEED, y: 0, z: 0 },
    });
    // Projected movement climbs at speed * sin(theta); allow for the first
    // frames spent settling onto the surface.
    assert.ok(uphill.travelX > 0);
    assert.ok(
      uphill.climb > MOVE_SPEED * Math.sin(Math.PI / 6) * 0.9,
      `expected the walk to gain height, climbed ${uphill.climb.toFixed(3)}`,
    );
  });

  it("reproduces the creep the fix removes", () => {
    // Velocity-driven control plus Havok's default 0.5 friction, which is what
    // the client actually ran while the material writes were being discarded.
    const { drift } = simulate({
      degrees: 30,
      legacyController: true,
      defaultMaterials: true,
    });
    assert.ok(
      drift > 0.5,
      `expected the old controller to slide, drifted ${drift.toFixed(3)}`,
    );
  });

  it("holds even on default friction, because the anchor does not rely on it", () => {
    const { drift } = simulate({ degrees: 30, defaultMaterials: true });
    assert.ok(drift < 0.1, `expected the capsule to stay put, drifted ${drift.toFixed(3)}`);
  });
});

describe("physics materials reach Havok", () => {
  it("keeps friction when the material is assigned as a whole", () => {
    const engine = new BABYLON.NullEngine();
    const scene = new BABYLON.Scene(engine);
    const plugin = new BABYLON.HavokPlugin(true, HK);
    scene.enablePhysics(new BABYLON.Vector3(0, WORLD_GRAVITY_Y, 0), plugin);

    const { shape } = createSlope(scene, 30);
    assert.equal(plugin.getMaterial(shape).friction, GROUND_FRICTION);

    // Mutating the getter's copy is the trap this contract exists to avoid.
    shape.material.friction = 0.01;
    assert.equal(plugin.getMaterial(shape).friction, GROUND_FRICTION);
    engine.dispose();
  });

  it("assigns materials rather than mutating them in shipping code", async () => {
    const sources = await Promise.all(
      [
        "src/Game/Model/entity.ts",
        "src/Game/Zone/shado-world-physics-streamer.ts",
      ].map((file) => fsp.readFile(path.join(clientRoot, file), "utf8")),
    );
    for (const source of sources) {
      assert.match(source, /material = \{/);
      assert.doesNotMatch(source, /material\.friction\s*=/);
      assert.match(source, /GROUND_FRICTION/);
    }
  });
});
