import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";
import type Player from "./player";
import { WorldSocket } from "@ui/net/instances";
import { OpCodes } from "@game/Net/opcodes";
import { ClientPositionUpdate } from "@game/Net/internal/api/capnp/common";
import { AnimationDefinitions } from "@game/Animation/animation-constants";
import emitter from "@game/Events/events";

type SimpleVector4 = {
  x: number;
  y: number;
  z: number;
  heading: number;
};

export class PlayerMovement {
  private player: Player;
  private scene: BJS.Scene;
  private physicsBody: BJS.PhysicsBody;
  public moveSpeed: number = 20;
  public turnSpeed: number = 1.5;
  public gravity: boolean = true;
  public jumpImpulseStrength: number = 15; // Jump impulse strength
  public finalVelocity: BJS.Vector3 = BABYLON.Vector3.Zero(); // Add public property
  private sprintMultiplier: number = 2.0;
  private updateDelta: number = 0;
  private jumpState: string = "idle"; // Jump state: idle, leavingGround, inAir
  private lastPlayerPosition: SimpleVector4 = { x: 0, y: 0, z: 0, heading: 0 };
  private keyStates: { [key: string]: boolean } = {};

  public moveForward: boolean = false;

  constructor(player: Player, scene: BJS.Scene) {
    this.player = player;
    this.scene = scene;
    this.physicsBody = this.player.playerEntity!.physicsBody!;

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
      }
    });
  }

  private isActionPressed(action: string): boolean {
    const keyMap: Record<string, string> = {
      move_forward: "KeyW",
      move_backward: "KeyS",
      turn_left: "KeyA",
      turn_right: "KeyD",
      move_up: "Space",
      move_down: "ControlLeft",
      sprint: "ShiftLeft",
    };
    return !!this.keyStates[keyMap[action]];
  }

  private isMovementKeysPressed(): boolean {
    return (
      this.isActionPressed("move_forward") ||
      this.isActionPressed("move_backward") ||
      this.isActionPressed("turn_left") ||
      this.isActionPressed("turn_right") ||
      this.moveForward
    );
  }

  private isOnFloor(): boolean {
    const ray = new BABYLON.Ray(
      this.player.playerEntity!.position!,
      new BABYLON.Vector3(0, -1, 0),
      2.1, // Slightly longer than capsule height
    );
    const hit = this.scene.pickWithRay(ray);
    return (hit?.hit && hit.distance < 1.1) ?? false;
  }

  public movementTick(delta: number) {
    const playerEntity = this.player.playerEntity;
    if (!playerEntity || !this.physicsBody) return;

    if (
      document.activeElement &&
      !(
        document.activeElement === document.body ||
        document.activeElement === this.player.gameManager.canvas
      )
    ) {
      return;
    }

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
    this.lastPlayerPosition = {
      heading,
      x: currentPos.x,
      y: currentPos.y,
      z: currentPos.z,
    };

    const mouseCaptured = this.scene.getEngine().isPointerLock;
    const firstPerson = this.player.playerCamera.isFirstPerson;
    let didTurn = false;
    let didCrouch = false;
    let playWalk = false;

    // Handle turning
    if (!mouseCaptured) {
      if (this.isActionPressed("turn_left")) {
        didTurn = true;
        this.player.playerCamera.cameraYaw += this.turnSpeed * delta;
        this.player.setRotation(this.player.playerCamera.cameraYaw);
      }
      if (this.isActionPressed("turn_right")) {
        didTurn = true;
        this.player.playerCamera.cameraYaw -= this.turnSpeed * delta;
        this.player.setRotation(this.player.playerCamera.cameraYaw);
      }
    }

    // Compute movement direction
    const movement = new BABYLON.Vector3(0, 0, 0);
    if (this.isActionPressed("move_forward") || this.moveForward) {
      movement.x = -1;

      playWalk = true;
    }
    if (this.isActionPressed("move_backward")) {
      movement.x = 1;

      playWalk = true;
    }
    if (this.isActionPressed("turn_left") && mouseCaptured) {
      movement.z = 1;

      playWalk = true;
    }
    if (this.isActionPressed("turn_right") && mouseCaptured) {
      movement.z = -1;

      playWalk = true;
    }
    if (this.isActionPressed("move_down")) {
      movement.y = -1;
      didCrouch = true;
    }

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
    const onFloor = this.isOnFloor();
    const notJumping = this.jumpState === "idle" && onFloor;
    if (
      this.isActionPressed("move_up") &&
      // this.jumpState === "idle" &&
      true //onFloor
    ) {
      this.jumpState = "leavingGround";
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
    if (this.jumpState === "leavingGround" && !onFloor) {
      this.jumpState = "inAir";
    }
    if (this.jumpState === "leavingGround" && onFloor) {
      this.jumpState = "idle";
    }
    if (this.jumpState === "inAir" && onFloor) {
      this.jumpState = "idle";
    }

    // Compute velocity
    const speedMod = this.isActionPressed("sprint")
      ? this.sprintMultiplier
      : 1.0;
    const movementZScaled = movement.z * this.moveSpeed * speedMod;
    const movementXScaled = movement.x * this.moveSpeed * speedMod;
    const movementYScaled = movement.y * this.moveSpeed * speedMod;

    const velocityForward = forwardXZ.scale(movementZScaled);
    const velocityStrafe = rightXZ.scale(movementXScaled);
    const velocityY = new BABYLON.Vector3(0, 1, 0).scale(movementYScaled);

    const velocityXZ = velocityForward.add(velocityStrafe);
    const velocity =
      velocityXZ.length() > 0
        ? velocityXZ.normalize().scale(this.moveSpeed * speedMod)
        : velocityXZ;
    this.finalVelocity = velocity.add(velocityY); // Store finalVelocity
    const finalVelocity = velocity.add(velocityY);

    // Apply velocity
    if (!this.isMovementKeysPressed()) {
      // Stop horizontal movement when no keys are pressed
      const currentVelocity = this.physicsBody.getLinearVelocity();
      this.physicsBody.setLinearVelocity(
        new BABYLON.Vector3(0, currentVelocity.y, 0),
      );
    } else {
      const currentVelocity = this.physicsBody.getLinearVelocity();
      emitter.emit("playerMovement", currentPos);

      this.physicsBody.setLinearVelocity(
        new BABYLON.Vector3(
          finalVelocity.x,
          currentVelocity.y,
          finalVelocity.z,
        ),
      );
    }

    // Limit vertical velocity
    const maxVerticalSpeed = 9.8 * 1.5;
    const currentVelocity = this.physicsBody.getLinearVelocity();
    if (currentVelocity.y < -maxVerticalSpeed) {
      this.physicsBody.setLinearVelocity(
        new BABYLON.Vector3(
          currentVelocity.x,
          -maxVerticalSpeed,
          currentVelocity.z,
        ),
      );
    }

    // Play animations

    if (playWalk) {
      if (didCrouch) {
        this.player.playDuckWalk();
      } else if (this.isActionPressed("sprint")) {
        this.player.playRun();
      } else {
        this.player.playWalk();
      }
    } else if (didTurn) {
      this.player.playShuffle();
    } else {
      this.player.playIdle();
    }

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
        console.error("[PlayerMovement] Error sending position update:", e);
      }
    }

    // Update camera
    this.player.playerCamera.updateCameraPosition();
  }
}
