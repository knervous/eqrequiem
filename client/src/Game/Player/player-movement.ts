import type * as BJS from '@babylonjs/core';
import BABYLON from '@bjs';
import { AnimationDefinitions } from '@game/Animation/animation-constants';
import { UserConfig } from '@game/Config/config';
import { bindingToCode } from '@game/Config/key-bindings';
import emitter from '@game/Events/events';
import { ClientPositionUpdate } from '@game/Net/messages';
import { OpCodes } from '@game/Net/opcodes';
import {
  GROUND_PROBE_EPSILON,
  groundContactDistance,
  groundRestDistance,
  groundStickSpeed,
  isWalkableSlope,
  JUMP_GRACE_SECONDS,
  projectVelocityOnGround,
} from '@game/Physics/ground';
import { WorldSocket } from '@ui/net/instances';
import type { PlayerGamepad } from './player-gamepad';
import type Player from './player';

const clampUnit = (value: number) => Math.max(-1, Math.min(1, value));

type SimpleVector4 = {
  x: number;
  y: number;
  z: number;
  heading: number;
};

/** Result of the downward probe under the capsule for a single frame. */
type GroundSample = {
  /** The capsule is resting on static world geometry. */
  grounded: boolean;
  /** That geometry is shallow enough to stand on rather than slide down. */
  walkable: boolean;
  /** Surface normal of the hit, or world up when there is no contact. */
  normal: BJS.Vector3;
  /** How far the capsule floats above true contact, in world units. */
  gap: number;
};

export class PlayerMovement {
  private player: Player;
  private scene: BJS.Scene;
  public moveSpeed: number = 20;
  public turnSpeed: number = 1.5;
  /** Cleared by the dev gravity toggle; also suspends ground anchoring. */
  public gravity: boolean = true;
  public jumpImpulseStrength: number = 25; // Jump impulse strength
  public finalVelocity: BJS.Vector3 = BABYLON.Vector3.Zero(); // Add public property
  private sprintMultiplier: number = 2.0;
  private updateDelta: number = 0;
  private jumpState: string = 'idle'; // Jump state: idle, leavingGround, inAir
  private lastPlayerPosition: SimpleVector4 = { x: 0, y: 0, z: 0, heading: 0 };
  private keyStates: { [key: string]: boolean } = {};
  private autoRun: boolean = false;
  public moveForward: boolean = false;
  /** Mirrors the gravity factor written to Havok so it is only set on change. */
  private gravityFactor: number = 1;
  /** Blocks re-anchoring for a moment after a jump leaves the ground. */
  private jumpGrace: number = 0;
  private readonly groundNormal: BJS.Vector3 = new BABYLON.Vector3(0, 1, 0);
  private readonly groundRayEnd: BJS.Vector3 = BABYLON.Vector3.Zero();
  private readonly groundResult: BJS.PhysicsRaycastResult =
    new BABYLON.PhysicsRaycastResult();
  private readonly anchoredVelocity: BJS.Vector3 = BABYLON.Vector3.Zero();

  private get physicsBody(): BJS.PhysicsBody {
    return this.player.playerEntity?.physicsBody as BJS.PhysicsBody;
  }

  constructor(player: Player, scene: BJS.Scene) {
    this.player = player;
    this.scene = scene;

    // Register keyboard listeners
    this.scene.onKeyboardObservable.add((kbInfo) => {
      const code = kbInfo.event.code;
      switch (kbInfo.type) {
        case BABYLON.KeyboardEventTypes.KEYDOWN:
          this.keyStates[code] = true;
          break;
        case BABYLON.KeyboardEventTypes.KEYUP:
          this.keyStates[code] = false;
          break;
        default:
          break;
      }
    });
  }

  public toggleAutoRun() {
    this.autoRun = !this.autoRun;
  }

  public dispose() {
    this.scene.onKeyboardObservable.clear();
    this.scene = null as any;
    this.player = null as any;
  }

  private isActionPressed(action: string): boolean {
    const bindings = UserConfig.instance.getConfig().keyBindings;
    const keyMap: Record<string, string | null> = {
      move_forward : bindingToCode(bindings.moveForward),
      move_backward: bindingToCode(bindings.moveBackward),
      turn_left    : bindingToCode(bindings.turnLeft),
      turn_right   : bindingToCode(bindings.turnRight),
      move_up      : bindingToCode(bindings.jump),
      move_down    : bindingToCode(bindings.crouch),
      sprint       : bindingToCode(bindings.sprint),
    };
    const code = keyMap[action];
    if (code && this.keyStates[code]) {
      return true;
    }
    switch (action) {
      case 'move_up':
        return this.gamepad?.jump ?? false;
      case 'move_down':
        return this.gamepad?.crouch ?? false;
      case 'sprint':
        return this.gamepad?.sprint ?? false;
      default:
        return false;
    }
  }

  /** Analog stick contribution for the current frame, or zero without a pad. */
  private get analogMove(): { forward: number; strafe: number } {
    const move = this.gamepad?.move;
    if (!move) {return { forward: 0, strafe: 0 };}
    return { forward: move.forward, strafe: move.strafe };
  }

  private get gamepad(): PlayerGamepad | null {
    return this.player?.playerGamepad ?? null;
  }

  private isMovementKeysPressed(): boolean {
    const analog = this.analogMove;
    return (
      this.isActionPressed('move_forward') ||
      this.isActionPressed('move_backward') ||
      this.isActionPressed('turn_left') ||
      this.isActionPressed('turn_right') ||
      analog.forward !== 0 ||
      analog.strafe !== 0 ||
      this.moveForward ||
      this.autoRun
    );
  }

  /**
   * Casts straight down from the capsule centre and reports what is underneath.
   *
   * The controller needs the surface normal as well as the contact itself: the
   * normal decides whether the ground is walkable and which plane movement runs
   * along. Passing the player body as `ignoreBody` also picks the body's own
   * floating-origin world region for the query, which matters far from origin.
   */
  private sampleGround(): GroundSample {
    const normal = this.groundNormal.set(0, 1, 0);
    const airborne: GroundSample = {
      gap     : 0,
      grounded: false,
      normal,
      walkable: false,
    };

    const playerEntity = this.player.playerEntity;
    if (!playerEntity || !this.physicsBody) {return airborne;}

    const origin = this.player.getPlayerPosition();
    if (!origin) {return airborne;}

    // Capsule height (Y-extent); half of it is the flat-ground standing height.
    const shape = this.physicsBody.shape;
    let shapeHeight = 2.0;
    let radius = 0;
    if (shape instanceof BABYLON.PhysicsShapeCapsule) {
      const bb = shape.getBoundingBox();
      shapeHeight = bb.maximum.y - bb.minimum.y;
      radius = Math.min(
        (bb.maximum.x - bb.minimum.x) * 0.5,
        shapeHeight * 0.5,
      );
    }
    const halfHeight = shapeHeight * 0.5;
    const baseline = halfHeight + GROUND_PROBE_EPSILON;

    this.groundRayEnd.copyFrom(origin);
    this.groundRayEnd.y -= shapeHeight;
    this.groundResult.reset();
    this.player.physicsPlugin.raycast(origin, this.groundRayEnd, this.groundResult, {
      collideWith: 0x00000dad1,
      ignoreBody : this.physicsBody,
    });

    const hitBody = this.groundResult.body;
    if (!hitBody || hitBody.motionType !== BABYLON.PhysicsMotionType.STATIC) {
      return airborne;
    }

    normal.copyFrom(this.groundResult.hitNormalWorld);
    // A wall or ceiling is not something to stand on.
    if (normal.y <= 0) {
      return airborne;
    }
    const distance = this.groundResult.hitDistance;
    if (distance > groundContactDistance(baseline, normal.y)) {
      return airborne;
    }

    return {
      gap     : Math.max(
        0,
        distance - groundRestDistance(halfHeight, radius, normal.y),
      ),
      grounded: true,
      normal,
      walkable: isWalkableSlope(normal.y),
    };
  }

  /** Havok gravity is suspended while anchored, so only write on a change. */
  private setGravityFactor(factor: number) {
    if (this.gravityFactor === factor) {return;}
    this.gravityFactor = factor;
    this.physicsBody?.setGravityFactor(factor);
  }

  public movementTick(delta: number) {
    const playerEntity = this.player.playerEntity;
    if (!playerEntity || !this.physicsBody) {return;}

    const currentPos = playerEntity.spawnPosition;
    const heading = playerEntity.getHeading();
    if (currentPos === undefined || heading === undefined) {
      return;
    }

    // Update player movement state
    this.player.isPlayerMoving =
      currentPos.x !== this.lastPlayerPosition.x ||
      currentPos.y !== this.lastPlayerPosition.y ||
      currentPos.z !== this.lastPlayerPosition.z ||
      heading !== this.lastPlayerPosition.heading;
 
    const mouseCaptured = this.scene.getEngine().isPointerLock;
    const firstPerson = this.player.playerCamera.isFirstPerson;
    let didTurn = false;
    let didCrouch = false;
    let playWalk = false;

    // Handle turning
    if (!mouseCaptured) {
      if (this.isActionPressed('turn_left')) {
        didTurn = true;
        this.player.playerCamera.cameraYaw += this.turnSpeed * delta;
        this.player.setRotation(this.player.playerCamera.cameraYaw);
      }
      if (this.isActionPressed('turn_right')) {
        didTurn = true;
        this.player.playerCamera.cameraYaw -= this.turnSpeed * delta;
        this.player.setRotation(this.player.playerCamera.cameraYaw);
      }
    }

    // Compute movement direction
    const movement = new BABYLON.Vector3(0, 0, 0);
    if (this.isActionPressed('move_forward') || this.moveForward) {
      movement.x = -1;
      this.autoRun = false; // Disable auto-run when moving forward
      playWalk = true;
    }
    if (this.isActionPressed('move_backward')) {
      movement.x = 1;
      this.autoRun = false; // Disable auto-run when moving backward
      playWalk = true;
    }
    if (this.isActionPressed('turn_left') && mouseCaptured) {
      movement.z = 1;

      playWalk = true;
    }
    if (this.isActionPressed('turn_right') && mouseCaptured) {
      movement.z = -1;
      playWalk = true;
    }
    if (this.isActionPressed('move_down')) {
      movement.y = -1;
      didCrouch = true;
    }

    // Autorun
    if (this.autoRun) {
      movement.x = -1;
      playWalk = true;
    }

    // Controller sticks. Pushing the stick forward reads as -1 on the Y axis,
    // which matches the sign convention the forward key uses above.
    const analog = this.analogMove;
    if (analog.forward !== 0 || analog.strafe !== 0) {
      movement.x = clampUnit(movement.x + analog.forward);
      movement.z = clampUnit(movement.z - analog.strafe);
      this.autoRun = false;
      playWalk = true;
    }

    // Analog sticks move the player slower when partly deflected; keyboard
    // input always lands on a full-magnitude vector so this is a no-op there.
    const inputMagnitude = Math.min(
      1,
      Math.hypot(movement.x, movement.z),
    );

    // Compute forward and right vectors
    let forward: BJS.Vector3;
    if (firstPerson) {
      // In first-person, use cameraYaw directly
      const yaw = this.player.playerCamera.cameraYaw;
      forward = new BABYLON.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw))
        .normalize()
        .scale(-1);
    } else if (
      playerEntity.absoluteRotationQuaternion &&
      !playerEntity.absoluteRotationQuaternion.equals(BABYLON.Quaternion.Zero())
    ) {
      // In third-person, use quaternion if valid
      forward = BABYLON.Vector3.Forward().rotateByQuaternionToRef(
        playerEntity.absoluteRotationQuaternion,
        new BABYLON.Vector3(),
      );
    } else {
      // Fallback for third-person if quaternion is invalid
      const yaw = playerEntity.rotation.y ?? this.player.playerCamera.cameraYaw;
      forward = new BABYLON.Vector3(
        -Math.sin(yaw),
        0,
        -Math.cos(yaw),
      ).normalize();
    }

    const forwardXZ = new BABYLON.Vector3(forward.x, 0, forward.z);
    if (forwardXZ.lengthSquared() > 0.0001) {
      forwardXZ.normalize();
    } else {
      forwardXZ.set(0, 0, 1); // Default forward
    }

    const rightXZ = BABYLON.Vector3.Cross(
      new BABYLON.Vector3(0, 1, 0),
      forwardXZ,
    ).normalize();
    // Handle jump
    const ground = this.sampleGround();
    const onFloor = ground.grounded;
    this.jumpGrace = Math.max(0, this.jumpGrace - delta);
    if (
      this.isActionPressed('move_up') &&
      // this.jumpState === "idle" &&
      true // onFloor
    ) {
      this.jumpState = 'leavingGround';
      // Ground contact still reads true on the frame the jump starts, so the
      // grace window is what keeps the anchor from eating the impulse.
      this.jumpGrace = JUMP_GRACE_SECONDS;
      this.setGravityFactor(1);
      const currentVelocity = this.physicsBody.getLinearVelocity();
      const jumpVelocity = new BABYLON.Vector3(0, this.jumpImpulseStrength, 0);
      this.physicsBody.setLinearVelocity(
        new BABYLON.Vector3(
          currentVelocity.x,
          jumpVelocity.y,
          currentVelocity.z,
        ),
      );
      this.player.playJump();
    }

    // Update jump state
    if (this.jumpState === 'leavingGround' && !onFloor) {
      this.jumpState = 'inAir';
    }
    if (this.jumpState === 'leavingGround' && onFloor) {
      this.jumpState = 'idle';
    }
    if (this.jumpState === 'inAir' && onFloor) {
      this.jumpState = 'idle';
    }

    // Compute velocity
    let speedMod = this.isActionPressed('sprint')
      ? this.sprintMultiplier
      : 1.0;
    if (this.player.Running) {
      speedMod *= 2.0;
    }
    const movementZScaled = movement.z * this.moveSpeed * speedMod;
    const movementXScaled = movement.x * this.moveSpeed * speedMod;
    const movementYScaled = movement.y * this.moveSpeed * speedMod;

    const velocityForward = forwardXZ.scale(movementZScaled);
    const velocityStrafe = rightXZ.scale(movementXScaled);
    const velocityY = new BABYLON.Vector3(0, 1, 0).scale(movementYScaled);

    const velocityXZ = velocityForward.add(velocityStrafe);
    const velocity =
      velocityXZ.length() > 0
        ? velocityXZ
          .normalize()
          .scale(this.moveSpeed * speedMod * inputMagnitude)
        : velocityXZ;
    this.finalVelocity = velocity.add(velocityY); // Store finalVelocity
    const finalVelocity = velocity.add(velocityY);

    // Play animations
    if (this.jumpState === 'leavingGround') {
      this.player.playJump();
    } else if (playWalk) {
      if (didCrouch) {
        this.player.playDuckWalk();
      } else if (this.player.Running) {
        this.player.playRun();
      } else {
        this.player.playWalk();
      }
    } else if (didTurn) {
      this.player.playShuffle();
    } else {
      this.player.playIdle();
    }

    // Apply velocity.
    //
    // Anchored means resting on ground shallow enough to stand on, with no
    // jump in flight. Gravity is suspended for that state: leaving it on makes
    // Havok re-accumulate a downward velocity every step, and the contact
    // solver turns that into motion along the slope tangent, so the player
    // creeps downhill for as long as they stand there.
    const moving = this.isMovementKeysPressed();
    const anchored =
      this.gravity && onFloor && ground.walkable && this.jumpGrace <= 0;

    if (moving) {
      emitter.emit('playerMovement', currentPos);
    }

    if (anchored) {
      this.setGravityFactor(0);
      // Gravity is off, so anything still floating above the surface has to be
      // pulled down deliberately; at true contact the pull is zero and standing
      // still on a slope holds exactly still.
      const stick = groundStickSpeed(ground.gap, delta);
      if (moving) {
        projectVelocityOnGround(
          { x: finalVelocity.x, y: 0, z: finalVelocity.z },
          ground.normal,
          stick,
          this.anchoredVelocity,
        );
      } else {
        this.anchoredVelocity.set(0, -stick, 0);
      }
      this.physicsBody.setLinearVelocity(this.anchoredVelocity);
    } else {
      // Airborne, or on ground too steep to stand on: keep the simulated
      // vertical velocity, steer horizontally, and cap the fall.
      this.setGravityFactor(this.gravity ? 1 : 0);
      const currentVelocity = this.physicsBody.getLinearVelocity();
      const maxVerticalSpeed = 9.8 * 1.5;
      this.physicsBody.setLinearVelocity(
        new BABYLON.Vector3(
          moving ? finalVelocity.x : 0,
          Math.max(currentVelocity.y, -maxVerticalSpeed),
          moving ? finalVelocity.z : 0,
        ),
      );
    }

    emitter.emit('playerPosition', this.player.getPlayerPosition()!);
    emitter.emit('playerRotation', this.player.getPlayerRotation());
    // Network update
    this.updateDelta += delta;
    if (this.updateDelta > 0.5) {
      this.updateDelta = 0;
      try {
        WorldSocket.sendMessage(OpCodes.ClientUpdate, ClientPositionUpdate, {
          x: currentPos.x,
          y: currentPos.y,
          z: currentPos.z,
          heading,
          animation:
            this.player.playerEntity?.currentAnimation ??
            AnimationDefinitions.Idle1,
        });
      } catch (e) {
        console.error('[PlayerMovement] Error sending position update:', e);
      }
    }

    this.lastPlayerPosition = {
      heading,
      x: currentPos.x,
      y: currentPos.y,
      z: currentPos.z,
    };

    // Update camera
    this.player.playerCamera.updateCameraPosition();
  }
}
