import {
  Input,
  Vector3,
  CharacterBody3D,
  DisplayServer,
} from "godot";
import Player from "./player";
  
export default class PlayerMovement {
  private player: Player;
  private move_speed: number = 20;
  private turn_speed: number = 1.5;
  private sprint_multiplier: number = 2.0;
  private velocity = new Vector3(0, 0, 0);
  private movement = new Vector3(0, 0, 0);
  private vectorUp = new Vector3(0, 1, 0);
  private forwardXZ = new Vector3(0, 0, 0);
  private rightXZ = new Vector3(0, 0, 0);
  private isOnFloor: boolean = true; // Track if player is on the floor for jumping
  
  constructor(player: Player) {
    this.player = player;
  }
  
  private getNode(): CharacterBody3D | null {
    return this.player.getNode() as CharacterBody3D;
  }
  
  public tick(delta: number) {
    const node = this.getNode();
    if (!node || this.player.getNode()?.get_viewport()?.gui_get_focus_owner()) return;
  
    // Check if player is on the floor for jumping logic
    this.isOnFloor = node.is_on_floor();
  
    const mouseCaptured =
        DisplayServer.mouse_get_mode() === Input.MouseMode.MOUSE_MODE_CAPTURED;
    let didTurn = false;
    let playWalk = false;
    let didJump = false;
    let didCrouch = false;
  
    this.movement.set(0, 0, 0);
  
    if (!mouseCaptured) {
      const rotation = node.rotation;
      if (Input.is_action_pressed("turn_left")) {
        didTurn = true;
        node.rotate_y(this.turn_speed * delta);
        // Sync camera yaw with player rotation
        this.player.getNode()?.get_viewport()?.get_camera_3d()?.get_parent()?.syncCameraYaw?.(rotation.y);
      }
      if (Input.is_action_pressed("turn_right")) {
        didTurn = true;
        node.rotate_y(-this.turn_speed * delta);
        // Sync camera yaw with player rotation
        this.player.getNode()?.get_viewport()?.get_camera_3d()?.get_parent()?.syncCameraYaw?.(rotation.y);
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
  
    // Handle jump (move_up) and crouch (move_down)
    if (Input.is_action_just_pressed("move_up") && this.isOnFloor) {
      this.movement.y = 1; // Trigger jump
      didJump = true;
      this.velocity.y = this.move_speed; // Apply immediate upward velocity for jump
    }
    if (Input.is_action_pressed("move_down")) {
      this.movement.y = -1; // Trigger crouch
      didCrouch = true;
    } else if (!didJump) {
      this.movement.y = 0; // Reset Y movement if not jumping or crouching
    }
  
    // Animation logic
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
  
    // Early exit if no movement
    if (
      this.movement.x === 0 &&
        this.movement.z === 0 &&
        this.movement.y === 0 &&
        !didTurn &&
        this.velocity.y === 0
    ) {
      this.velocity.set(0, 0, 0);
      node.velocity = this.velocity;
      node.move_and_slide();
      return;
    }
  
    const camera = this.player.getNode()?.get_viewport()?.get_camera_3d();
    if (!camera) return;
  
    // Calculate movement vectors
    const { x: basisX, z: basisZ } = camera.transform.basis.z;
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
      ? this.sprint_multiplier
      : 1.0;
    const movementZScaled = this.movement.z * this.move_speed * speedMod;
    const movementXScaled = this.movement.x * this.move_speed * speedMod;
    const movementYScaled = this.movement.y * this.move_speed * speedMod;
  
    // Apply gravity if not on floor
    if (!this.isOnFloor) {
      //   this.velocity.y -= 9.8 * delta * 2; // Apply gravity (tuned for Godot)
    } else if (!didJump && !didCrouch) {
      this.velocity.y = 0; // Reset vertical velocity when on floor
    }
  
    // Calculate velocity
    const velocityForward = this.forwardXZ.multiplyScalar(movementZScaled);
    const velocityStrafe = this.rightXZ.multiplyScalar(movementXScaled);
    const velocityY = this.vectorUp.multiplyScalar(movementYScaled);
  
    const velocityXZ = velocityForward.add(velocityStrafe);
    if (velocityXZ.length() > 0) {
      velocityXZ.normalized().multiplyScalar(this.move_speed * speedMod);
    }
  
    // Combine horizontal and vertical velocity
    this.velocity.x = velocityXZ.x;
    this.velocity.z = velocityXZ.z;
    if (didJump || didCrouch || !this.isOnFloor) {
      this.velocity.y = this.velocity.y; // Preserve existing Y velocity for jump/gravity
    } else {
      this.velocity.y = velocityY.y; // Apply crouch velocity if applicable
    }
  
    node.velocity = this.velocity;
    node.move_and_slide();
  }
}