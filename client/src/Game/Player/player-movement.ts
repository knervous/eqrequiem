import BABYLON from '@bjs';
import type * as BJS from '@babylonjs/core';
import type Player from "./player"; // Assuming Player type is defined
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
  public gravityCoefficient: number = -5.76;
  private sprintMultiplier: number = 2.0;
  private updateDelta: number = 0;

  private velocity: BJS.Vector3 = new BABYLON.Vector3(0, 0, 0);
  private movement: BJS.Vector3 = new BABYLON.Vector3(0, 0, 0);
  private vectorUp: BJS.Vector3 = new BABYLON.Vector3(0, 1, 0);
  private forwardXZ: BJS.Vector3 = new BABYLON.Vector3(0, 0, 0);
  private rightXZ: BJS.Vector3 = new BABYLON.Vector3(0, 0, 0);
  private lastPlayerPosition: SimpleVector4 = { x: 0, y: 0, z: 0, heading: 0 };

  // Key state tracking
  private keyStates: { [key: string]: boolean } = {};

  constructor(player: Player, scene: BJS.Scene) {
    this.player = player;
    this.scene  = scene;
    this.physicsBody = this.player.mesh!.physicsBody!;

    // === register keyboard listeners ===
    this.scene.onKeyboardObservable.add((kbInfo) => {
      const code = kbInfo.event.code;             // e.g. "KeyW", "Space"
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
    const keyMap: Record<string,string> = {
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


  public movementTick(delta: number) {
    const mesh = this.player.mesh;
    if (!mesh || !this.physicsBody) return;
    console.log('Tick', delta);
  
    if (document.activeElement && document.activeElement !== document.body) {
      return;
    }
  
    const currentPos = mesh.position;
    const heading = mesh.rotation.y;
    if (currentPos === undefined || heading === undefined) {
      return;
    }
  
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
    let didTurn = false;
    this.movement.set(0, 0, 0);
    let playWalk = false;
    let didJump = false;
    let didCrouch = false;
  
    const onFloor = false;// Math.abs(this.velocity.y) < 0.1;
  
    if (!mouseCaptured) {
      if (this.isActionPressed("turn_left")) {
        didTurn = true;
        mesh.rotation.y += this.turnSpeed * delta;
        this.player.playerCamera.cameraYaw = mesh.rotation.y + Math.PI / 2;
      }
      if (this.isActionPressed("turn_right")) {
        didTurn = true;
        mesh.rotation.y -= this.turnSpeed * delta;
        this.player.playerCamera.cameraYaw = mesh.rotation.y + Math.PI / 2;
      }
    }
  
    if (this.isActionPressed("move_forward")) {
      this.movement.z = -1;
      playWalk = true;
    }
    if (this.isActionPressed("move_backward")) {
      this.movement.z = 1;
      playWalk = true;
    }
    if (this.isActionPressed("turn_left") && mouseCaptured) {
      playWalk = true;
      this.movement.x = 1;
    }
    if (this.isActionPressed("turn_right") && mouseCaptured) {
      playWalk = true;
      this.movement.x = -1;
    }
    if (this.isActionPressed("move_up")) {
      this.movement.y = 1;
      didJump = true;
    }
    if (this.isActionPressed("move_down")) {
      this.movement.y = -1;
      didCrouch = true;
    }
  
    if (playWalk) {
      if (didJump) {
        this.player.playJump();
      } else if (didCrouch) {
        this.player.playDuckWalk();
      } else if (this.isActionPressed("sprint")) {
        this.player.playRun();
      } else {
        this.player.playWalk();
      }
    } else if (didTurn) {
      this.player.playShuffle();
    } else if (didJump) {
      this.player.playStationaryJump();
    } else {
      this.player.playIdle();
    }
  
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
  
    const forward = BABYLON.Vector3.Forward().rotateByQuaternionToRef(
      mesh.absoluteRotationQuaternion,
      new BABYLON.Vector3(),
    );
    this.forwardXZ.set(forward.x, 0, forward.z).normalize();
    this.rightXZ = BABYLON.Vector3.Cross(this.forwardXZ, this.vectorUp).normalize();
  
    const speedMod = this.isActionPressed("sprint") ? this.sprintMultiplier : 1.0;
    const movementZScaled = this.movement.z * this.moveSpeed * speedMod;
    const movementXScaled = this.movement.x * this.moveSpeed * speedMod;
    const movementYScaled = this.movement.y * this.moveSpeed * speedMod;
  
    const velocityForward = this.forwardXZ.scale(movementZScaled);
    const velocityStrafe = this.rightXZ.scale(movementXScaled);
    const velocityY = this.vectorUp.scale(movementYScaled);
  
    const velocityXZ = velocityForward.add(velocityStrafe);
    if (velocityXZ.length() > 0) {
      velocityXZ.normalize().scale(this.moveSpeed * speedMod);
    }
  
    if (this.gravity) {
      let newVy = this.velocity.y;
      if (onFloor) {
        if (didJump) {
          newVy = 9.0;
        } else {
          newVy = 0;
        }
      } else {
        newVy -= this.gravityCoefficient * delta;
      }
      this.velocity.set(velocityXZ.x, newVy, velocityXZ.z);
    } else {
      this.velocity = velocityXZ.add(velocityY);
    }
  
    this.physicsBody.setLinearVelocity(this.velocity);
    this.player.playerCamera.updateCameraPosition();
  
    // Debug logging
    console.log('Position:', mesh.position.asArray());
    console.log('Velocity:', this.velocity.asArray());
    console.log('Rotation:', mesh.rotation.y);
  }
}