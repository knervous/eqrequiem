import Actor from "../Actor/actor";
import {
  InputMap,
  InputEventKey,
  Input,
  Vector3,
  Key,
  MouseButton,
  Camera3D,
  CharacterBody3D,
  OmniLight3D,
  Color,
  DisplayServer,
  Node3D,
  MeshInstance3D,
} from "godot";
import { Extensions } from "../Util/extensions";



export default class Player extends Actor {
  move_speed: number = 20;
  turn_speed: number = 1.5;
  camera: Camera3D;
  isFirstPerson: boolean = false;
  sprint_multiplier: number = 2.0;
  private minCameraDistance: number = 1;
  private maxCameraDistance: number = 35;
  private cameraDistance: number = 13;
  private cameraHeight: number = 5;
  private cameraLight: OmniLight3D | null = null;

  private velocity = new Vector3(0, 0, 0);
  private movement = new Vector3(0, 0, 0);
  private lookatOffset = new Vector3(0, 1, 0);
  private vectorUp = new Vector3(0, 1, 0);
  private cameraPosition = new Vector3(0, 0, 0);
  private forwardXZ = new Vector3(0, 0, 0);
  private cameraPitch: number = 0;
  private rightXZ = new Vector3(0, 0, 0);

  static instance: Player | null = null;


  constructor(folder: string, model: string, camera: Camera3D) {
    super(folder, model);
    this.camera = camera;

    this.bindKeys();
    Player.instance = this;
  }

  public dispose() {
    //this.cameraLight?.queue_free();
    //Player.instance = null;
  }

  bindKeys() {
    const actions = [
      { name: "move_forward", key: Key.KEY_W },
      { name: "move_backward", key: Key.KEY_S },
      { name: "turn_left", key: Key.KEY_A },
      { name: "turn_right", key: Key.KEY_D },
      { name: "move_up", key: Key.KEY_SPACE }, // Space to move up
      { name: "move_down", key: Key.KEY_CTRL }, // Shift to move down
      { name: "sprint", key: Key.KEY_SHIFT }, // Ctrl to sprint
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

  public getPlayerRotation() {
    return Extensions.GetRotation(this.getNode() as CharacterBody3D);
  }

  public getPlayerPosition() {
    return Extensions.GetPosition(this.getNode() as CharacterBody3D);
  }

  private createCameraLight(node: Node3D | null = null) {
    this.cameraLight = new OmniLight3D();
    this.cameraLight.position = new Vector3(0, 5, 2);
    this.cameraLight.light_color = new Color(1.0, 0.85, 0.6, 1.0);
    this.cameraLight.light_energy = 4.0;
    this.cameraLight.light_specular = 0.0;
    this.cameraLight.omni_range = 250.0;
    this.cameraLight.layers = 1 << 0;
    node?.add_child(this.cameraLight);

    //this.cameraLight.shadow_enabled = true;
  }

  public input_mouse_motion(x: number, y: number) {
    const node = this.getNode() as CharacterBody3D;
    if (!node) return;
    if (
      DisplayServer.mouse_get_mode() === Input.MouseMode.MOUSE_MODE_CAPTURED
    ) {
      node.rotate_y(-x * 0.005);
      this.cameraPitch += y * 0.01;
      const minPitch = -Math.PI / 3;
      const maxPitch = Math.PI / 3;
      this.cameraPitch = Math.max(
        minPitch,
        Math.min(maxPitch, this.cameraPitch),
      );
      this.updateCameraPosition(node);
    }
  }
  tick(delta: number) {
    const node = this.getNode() as CharacterBody3D;
    if (!node) return;
    if (this.node?.get_viewport()?.gui_get_focus_owner()) {
      // A UI element is active; skip processing player movement.
      return;
    }

    // Handle Turning
    const mouseCaptured =
      DisplayServer.mouse_get_mode() === Input.MouseMode.MOUSE_MODE_CAPTURED;
    let didTurn = false;

    // Handle Movement Input
    this.movement.set(0, 0, 0);
    let playWalk = false;
    let didJump = false;
    let didCrouch = false;

    if (!mouseCaptured) {
      if (Input.is_action_pressed("turn_left")) {
        didTurn = true;
        node.rotate_y(this.turn_speed * delta);
      }
      if (Input.is_action_pressed("turn_right")) {
        didTurn = true;
        node.rotate_y(-this.turn_speed * delta);
      }
    } else {
      // Strafing input (A/D)
      if (Input.is_action_pressed("turn_left")) {
        playWalk = true;
        this.movement.x = 1; // Left strafe
      }
      if (Input.is_action_pressed("turn_right")) {
        playWalk = true;
        this.movement.x = -1; // Right strafe
      }
    }

    // Forward/Backward input (W/S)
    if (Input.is_action_pressed("move_forward")) {
      this.movement.z = -1;
      playWalk = true;
    }
    if (Input.is_action_pressed("move_backward")) {
      this.movement.z = 1;
      playWalk = true;
    }

    // Vertical input (Space/X)
    if (Input.is_action_pressed("move_up")) {
      this.movement.y = 1;
      didJump = true;
    }
    if (Input.is_action_pressed("move_down")) {
      this.movement.y = -1;
      didCrouch = true;
    }

    // Animation logic
    if (playWalk) {
      if (didJump) {
        this.playJump();
      } else if (didCrouch) {
        this.playDuckWalk();
      } else if (Input.is_action_pressed("sprint")) {
        this.playRun();
      } else {
        this.playWalk();
      }
    } else if (didTurn) {
      this.playShuffle();
    } else if (didJump) {
      this.playStationaryJump();
    } else {
      this.playIdle();
    }

    // Early exit if no movement
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
    // Calculate movement vectors based on camera orientation
    const [basisX, _basisY, basisZ] = Extensions.GetBasisZ(this.camera);

    // Forward direction (Z movement)
    this.forwardXZ.set(basisX, 0, basisZ);
    this.forwardXZ.normalized();

    // Right direction (X movement for strafing)
    // Compute cross product inline into rightXZ
    this.rightXZ.x =
      this.forwardXZ.y * this.vectorUp.z - this.forwardXZ.z * this.vectorUp.y;
    this.rightXZ.y =
      this.forwardXZ.z * this.vectorUp.x - this.forwardXZ.x * this.vectorUp.z;
    this.rightXZ.z =
      this.forwardXZ.x * this.vectorUp.y - this.forwardXZ.y * this.vectorUp.x;
    // Normalize rightXZ inline
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
      this.rightXZ.set(0, 0, 0); // Handle zero-length case
    }

    // Speed modifier
    const speedMod = Input.is_action_pressed("sprint")
      ? this.sprint_multiplier
      : 1.0;

    const movementZScaled = this.movement.z * this.move_speed * speedMod; // Forward/Backward
    const movementXScaled = this.movement.x * this.move_speed * speedMod; // Strafing
    const movementYScaled = this.movement.y * this.move_speed * speedMod; // Vertical

    const velocityForward = this.forwardXZ.multiplyScalar(movementZScaled);
    const velocityStrafe = this.rightXZ.multiplyScalar(movementXScaled);
    const velocityY = this.vectorUp.multiplyScalar(movementYScaled);

    const velocityXZ = velocityForward.add(velocityStrafe);
    if (velocityXZ.length() > 0) {
      velocityXZ.normalized().multiplyScalar(this.move_speed * speedMod);
    }

    this.velocity = velocityXZ.add(velocityY);

    node.velocity = this.velocity;
    node.move_and_slide();

    this.vectorUp.set(0, 1, 0);
    this.updateCameraPosition(node);
  }
  // Updated camera position computation using cameraPitch for vertical rotation
  public updateCameraPosition(node: CharacterBody3D) {
    const playerPos = Extensions.GetPosition(node);
    const playerRot = Extensions.GetRotation(node);
    if (this.isFirstPerson) {
      this.camera.position = playerPos.add(this.lookatOffset);
      this.camera.rotation.y = playerRot.y;
    } else {
      const correctedAngle = playerRot.y + Math.PI / 2;
      // Calculate horizontal and vertical offsets using cameraPitch
      const horizontalDistance =
        this.cameraDistance * Math.cos(this.cameraPitch);
      const verticalDistance = this.cameraDistance * Math.sin(this.cameraPitch);
      const offsetX = Math.sin(correctedAngle) * horizontalDistance;
      const offsetZ = Math.cos(correctedAngle) * horizontalDistance;
      // Set the camera's position with an added base height
      this.cameraPosition.set(
        playerPos.x + offsetX,
        playerPos.y + this.cameraHeight + verticalDistance,
        playerPos.z + offsetZ,
      );
      this.camera.position = this.cameraPosition;
      this.camera.look_at(playerPos.add(this.lookatOffset), Vector3.UP);
    }
  }
  adjustCameraDistance(delta: number) {
    const node = this.getNode();
    if (!node) return;

    this.cameraDistance = Math.max(
      this.minCameraDistance,
      Math.min(this.maxCameraDistance, this.cameraDistance + delta),
    );
    this.isFirstPerson = this.cameraDistance <= this.minCameraDistance;
    this.updateCameraPosition(node as CharacterBody3D);
  }

  public input(buttonIndex: number) {
    if (buttonIndex === MouseButton.MOUSE_BUTTON_WHEEL_UP) {
      this.adjustCameraDistance(-1);
    } else if (buttonIndex === MouseButton.MOUSE_BUTTON_WHEEL_DOWN) {
      this.adjustCameraDistance(1);
    }
  }

  public input_pan(delta: number) {
    this.adjustCameraDistance(delta < 0 ? -1 : 1);
  }

  public async Load(name: string) {
    await super.Load(name);
    const node = this.getNode() as CharacterBody3D;
    if (!node) return;
    node.set_process(true);
    node.set_physics_process(true);
    node.set_process_input(true);
    const setMeshLayers = (currentNode: Node3D) => {
      if (currentNode instanceof MeshInstance3D) {
        currentNode.layers = 1 << 1;
      }
      for (const child of currentNode.get_children()) {
        setMeshLayers(child as Node3D);
      }
    };
    setMeshLayers(node);
    node.scale = new Vector3(1.5, 1.5, 1.5);
    node.position = new Vector3(0, 5, 0);
    this.createCameraLight(node);
    this.updateCameraPosition(node);
  }
}
