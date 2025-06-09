import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";
import type Player from "./player";
import { WorldSocket } from "@ui/net/instances";
import { OpCodes } from "@game/Net/opcodes";
import { ClientPositionUpdate } from "@game/Net/internal/api/capnp/common";

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

  constructor(player: Player, scene: BJS.Scene) {
    this.player = player;
    this.scene = scene;
    this.physicsBody = this.player.mesh!.physicsBody!;

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
      this.isActionPressed("turn_right")
    );
  }

  private isOnFloor(): boolean {
    const ray = new BABYLON.Ray(
      this.player.mesh!.position!,
      new BABYLON.Vector3(0, -1, 0),
      2.1, // Slightly longer than capsule height
    );
    const hit = this.scene.pickWithRay(ray);
    return (hit?.hit && hit.distance < 1.1) ?? false;
  }

  public movementTick(delta: number) {
    const mesh = this.player.mesh;
    if (!mesh || !this.physicsBody) return;

    if (document.activeElement && document.activeElement !== document.body) {
      return;
    }

    const currentPos = mesh.position;
    const heading = mesh.rotation.y;
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
    if (this.isActionPressed("move_forward")) {
      if (firstPerson) {
        movement.z = -1;
      } else {
        // In third person, forward is negative Z
        movement.x = -1;
      }
      playWalk = true;
    }
    if (this.isActionPressed("move_backward")) {
      if (firstPerson) {
        movement.z = 1;
      } else {
        // In third person, backward is positive Z
        movement.x = 1;
      }
      playWalk = true;
    }
    if (this.isActionPressed("turn_left") && mouseCaptured) {
      if (firstPerson) {
        movement.x = -1;
      } else {
        movement.z = 1;
      }
      playWalk = true;
    }
    if (this.isActionPressed("turn_right") && mouseCaptured) {
      if (firstPerson) {
        movement.x = 1;
      } else {
        movement.z = -1;
      }
      playWalk = true;
    }
    if (this.isActionPressed("move_down")) {
      movement.y = -1;
      didCrouch = true;
    }

    // Compute forward and right vectors
    const forward = BABYLON.Vector3.Forward().rotateByQuaternionToRef(
      mesh.absoluteRotationQuaternion,
      new BABYLON.Vector3(),
    );
    const forwardXZ = new BABYLON.Vector3(forward.x, 0, forward.z).normalize();
    const rightXZ = BABYLON.Vector3.Cross(
      new BABYLON.Vector3(0, 1, 0),
      forwardXZ,
    ).normalize();

    // Handle jump
    const onFloor = this.isOnFloor();
    if (
      this.isActionPressed("move_up") &&
      this.jumpState === "idle" &&
      onFloor
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
      WorldSocket.sendMessage(OpCodes.ClientUpdate, ClientPositionUpdate, {
        x: -currentPos.x,
        y: currentPos.z,
        z: currentPos.y,
        heading,
        animation: 0,
      });
    }

    // Update camera
    this.player.playerCamera.updateCameraPosition();
  }
}
