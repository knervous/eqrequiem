import {
  InputMap,
  InputEventKey,
  Input,
  Vector3,
  Key,
  CharacterBody3D,
  DisplayServer,
  is_instance_valid,
} from "godot";
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
  public moveSpeed: number = 20;
  public turnSpeed: number = 1.5;
  public gravity: boolean = true;
  public gravityCoefficient: number = 14.76;
  private sprintMultiplier: number = 2.0;
  private updateDelta = 0;

  private velocity = new Vector3(0, 0, 0);
  private movement = new Vector3(0, 0, 0);
  private vectorUp = new Vector3(0, 1, 0);
  private forwardXZ = new Vector3(0, 0, 0);
  private rightXZ = new Vector3(0, 0, 0);
  private lastPlayerPosition: SimpleVector4 = { x: 0, y: 0, z: 0, heading: 0 };

  constructor(player: Player) {
    this.player = player;
    this.bindKeys();
    const node = this.player.getNode() as CharacterBody3D;
    console.log("Player collision layer:", node.collision_layer, "mask:", node.collision_mask);
  }

  bindKeys() {
    const actions = [
      { name: "move_forward", key: Key.KEY_W },
      { name: "move_backward", key: Key.KEY_S },
      { name: "turn_left", key: Key.KEY_A },
      { name: "turn_right", key: Key.KEY_D },
      { name: "move_up", key: Key.KEY_SPACE },
      { name: "move_down", key: Key.KEY_CTRL },
      { name: "sprint", key: Key.KEY_SHIFT },
    ];

    actions.forEach(({ name, key }) => {
      if (!InputMap.has_action(name)) {
        InputMap.add_action(name);
        const keyEvent = new InputEventKey();
        keyEvent.keycode = key;
        InputMap.action_add_event(name, keyEvent);
      }
    });
  }

  public movementTick(delta: number) {
    const node = this.player.getNode() as CharacterBody3D;
    if (!node || !is_instance_valid(node)) return;
    if (this.player.getNode()?.get_viewport()?.gui_get_focus_owner()) {
      return;
    }

    const currentPos = this.player.getPlayerPosition();
    if (!currentPos) {
      return;
    }
    const heading = this.player.getPlayerRotation();
    if (heading === undefined) {
      return;
    }
    this.player.isPlayerMoving =
      currentPos.x !== this.lastPlayerPosition.x ||
      currentPos.y !== this.lastPlayerPosition.y ||
      currentPos.z !== this.lastPlayerPosition.z ||
      heading.y !== this.lastPlayerPosition.heading;
    this.lastPlayerPosition = {
      heading: heading.y,
      x: currentPos.x,
      y: currentPos.y,
      z: currentPos.z,
    };

    const mouseCaptured =
      DisplayServer.mouse_get_mode() === Input.MouseMode.MOUSE_MODE_CAPTURED;
    let didTurn = false;

    this.movement.set(0, 0, 0);
    let playWalk = false;
    let didJump = false;
    let didCrouch = false;
    const onFloor = node.is_on_floor();
    if (!mouseCaptured) {
      const rotation = node.rotation;
      if (Input.is_action_pressed("turn_left")) {
        didTurn = true;
        node.rotate_y(this.turnSpeed * delta);
        // Sync camera yaw with player rotation during turn
        this.player.playerCamera.cameraYaw = rotation.y + Math.PI / 2;
      }
      if (Input.is_action_pressed("turn_right")) {
        didTurn = true;
        node.rotate_y(-this.turnSpeed * delta);
        // Sync camera yaw with player rotation during turn
        this.player.playerCamera.cameraYaw = rotation.y + Math.PI / 2;
      }
    } else {
      if (Input.is_action_pressed("turn_left")) {
        playWalk = true;
        this.movement.x = 1;
      }
      if (Input.is_action_pressed("turn_right")) {
        playWalk = true;
        this.movement.x = -1;
      }
    }

    if (Input.is_action_pressed("move_forward")) {
      this.movement.z = -1;
      playWalk = true;
    }
    if (Input.is_action_pressed("move_backward")) {
      this.movement.z = 1;
      playWalk = true;
    }

    if (Input.is_action_pressed("move_up")) {
      this.movement.y = 1;
      didJump = true;
    }
    if (Input.is_action_pressed("move_down")) {
      this.movement.y = -1;
      didCrouch = true;
    }

    // Rest of the animation logic remains unchanged
    if (playWalk) {
      if (didJump) {
        this.player.playJump();
      } else if (didCrouch) {
        this.player.playDuckWalk();
      } else if (Input.is_action_pressed("sprint")) {
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

    if (
      this.movement.x === 0 &&
      this.movement.y === 0 &&
      this.movement.z === 0 &&
      !didTurn
    ) {
      this.velocity.set(0, 0, 0);
      node.velocity = this.velocity;
      node.move_and_slide();
      return;
    }

    if (this.updateDelta > 0.5) {
      this.updateDelta = 0;
      console.log('Send update');
      WorldSocket.sendMessage(OpCodes.ClientUpdate, ClientPositionUpdate, {
        x: -currentPos.x,
        y: currentPos.z,
        z: currentPos.y,
        heading: heading.y,
        animation: 0,
      });
    }

    const { x: basisX, z: basisZ } = this.player.getNode()!.transform.basis.x;

    this.forwardXZ.set(basisX, 0, basisZ);
    this.forwardXZ.normalized();

    this.rightXZ.x =
      this.forwardXZ.y * this.vectorUp.z - this.forwardXZ.z * this.vectorUp.y;
    this.rightXZ.y =
      this.forwardXZ.z * this.vectorUp.x - this.forwardXZ.x * this.vectorUp.z;
    this.rightXZ.z =
      this.forwardXZ.x * this.vectorUp.y - this.forwardXZ.y * this.vectorUp.x;
    const rightLength = Math.sqrt(
      this.rightXZ.x * this.rightXZ.x +
        this.rightXZ.y * this.rightXZ.y +
        this.rightXZ.z * this.rightXZ.z,
    );
    if (rightLength > 0) {
      this.rightXZ.x /= rightLength;
      this.rightXZ.y /= rightLength;
      this.rightXZ.z /= rightLength;
    } else {
      this.rightXZ.set(0, 0, 0);
    }

    const speedMod = Input.is_action_pressed("sprint")
      ? this.sprintMultiplier
      : 1.0;
    const movementZScaled = this.movement.z * this.moveSpeed * speedMod;
    const movementXScaled = this.movement.x * this.moveSpeed * speedMod;
    const movementYScaled = this.movement.y * this.moveSpeed * speedMod;

    const velocityForward = this.forwardXZ.multiplyScalar(movementZScaled);
    const velocityStrafe = this.rightXZ.multiplyScalar(movementXScaled);
    const velocityY = this.vectorUp.multiplyScalar(movementYScaled);

    const velocityXZ = velocityForward.add(velocityStrafe);
    if (velocityXZ.length() > 0) {
      velocityXZ.normalized().multiplyScalar(this.moveSpeed * speedMod);
    }

    if (this.gravity) {
      const horizontal = velocityXZ;
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
      this.velocity.set(horizontal.x, newVy, horizontal.z);
    } else {
      const movementYScaled = this.movement.y * this.moveSpeed * speedMod;
      this.velocity.y = movementYScaled;
      this.velocity = velocityXZ.add(velocityY);
    }

    node.velocity = this.velocity;
    node.move_and_slide();

    this.vectorUp.set(0, 1, 0);
    this.player.playerCamera.updateCameraPosition(node);
  }
}
