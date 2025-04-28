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
  CollisionShape3D,
} from "godot";
import { Extensions } from "../Util/extensions";
import * as EQMessage from "../Net/message/EQMessage";
import RACE_DATA from "../Constants/race-data";
import { LoaderOptions } from "@game/GLTF/base";

// Simple position object for comparison
type SimpleVector3 = {
  x: number;
  y: number;
  z: number;
};

export default class Player extends Actor {
  public move_speed: number = 20;
  public turn_speed: number = 1.5;

  public player: EQMessage.PlayerProfile | null = null;

  private camera: Camera3D;
  private isFirstPerson: boolean = false;
  private sprint_multiplier: number = 2.0;
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

  private isCameraRotating: boolean = false;
  private cameraYaw: number = 0;
  private lastPlayerPosition: SimpleVector3 = { x: 0, y: 0, z: 0 };
  private isPlayerMoving: boolean = false;

  static instance: Player | null = null;

  static playerOptions: LoaderOptions = {
    flipTextureY: true,
    shadow: false, 
    useCapsulePhysics: true,
  };


  constructor(player: EQMessage.PlayerProfile, camera: Camera3D) {
    const race = player?.race ?? 1;
    const raceDataEntry = RACE_DATA[race];
    const model = raceDataEntry[player?.gender ?? 0] || raceDataEntry[2];
    super("models", model, Player.playerOptions);
    this.camera = camera;
    this.player = player;
    this.bindKeys();
    Player.instance = this;
  }

  public dispose() {
    //this.cameraLight?.queue_free();
    super.dispose();
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

  public getPlayerRotation() {
    return this.getNode()?.rotation;
  }

  public getPlayerPosition() {
    return this.getNode()?.global_position;
  }

  private createCameraLight(node: Node3D | null = null) {
    this.cameraLight = new OmniLight3D();
    this.cameraLight.position = new Vector3(0, 5, 0);
    this.cameraLight.light_color = new Color(1.0, 0.85, 0.6, 1.0);
    this.cameraLight.light_energy = 4.0;
    this.cameraLight.light_specular = 0.0;
    this.cameraLight.omni_range = 250.0;
    this.cameraLight.layers = 1 << 0;
    node?.add_child(this.cameraLight);
  }

  public input(buttonIndex: number) {
    if (buttonIndex === MouseButton.MOUSE_BUTTON_LEFT) {
      this.isCameraRotating = Input.is_mouse_button_pressed(
        MouseButton.MOUSE_BUTTON_LEFT,
      );
      if (this.isCameraRotating) {
        DisplayServer.mouse_set_mode(Input.MouseMode.MOUSE_MODE_CAPTURED);
      } else {
        DisplayServer.mouse_set_mode(Input.MouseMode.MOUSE_MODE_VISIBLE);
      }
    }
    if (buttonIndex === MouseButton.MOUSE_BUTTON_WHEEL_UP) {
      this.adjustCameraDistance(-1);
    } else if (buttonIndex === MouseButton.MOUSE_BUTTON_WHEEL_DOWN) {
      this.adjustCameraDistance(1);
    }
  }

  public input_mouse_motion(x: number, y: number) {
    const node = this.getNode() as CharacterBody3D;
    if (!node) return;

    if (
      DisplayServer.mouse_get_mode() === Input.MouseMode.MOUSE_MODE_CAPTURED
    ) {
      if (this.isCameraRotating) {
        this.cameraYaw -= x * 0.005;
        this.cameraPitch += y * 0.01;
        const minPitch = -Math.PI / 3;
        const maxPitch = Math.PI / 3;
        this.cameraPitch = Math.max(
          minPitch,
          Math.min(maxPitch, this.cameraPitch),
        );
        this.updateCameraPosition(node);
      } else {
        this.isPlayerMoving = true;
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
  }

  tick(delta: number) {
    const node = this.getNode() as CharacterBody3D;
    if (!node) return;
    if (this.node?.get_viewport()?.gui_get_focus_owner()) {
      return;
    }

    const currentPos = this.getPlayerPosition();
    this.isPlayerMoving =
      currentPos.x !== this.lastPlayerPosition.x ||
      currentPos.y !== this.lastPlayerPosition.y ||
      currentPos.z !== this.lastPlayerPosition.z;
    this.lastPlayerPosition = {
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

    if (!mouseCaptured) {
      const rotation = node.rotation;
      if (Input.is_action_pressed("turn_left")) {
        didTurn = true;
        node.rotate_y(this.turn_speed * delta);
        // Sync camera yaw with player rotation during turn
        this.cameraYaw = rotation.y + Math.PI / 2;
      }
      if (Input.is_action_pressed("turn_right")) {
        didTurn = true;
        node.rotate_y(-this.turn_speed * delta);
        // Sync camera yaw with player rotation during turn
        this.cameraYaw = rotation.y + Math.PI / 2;
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


    const { x: basisX, z: basisZ } = this.camera.transform.basis.z;

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

  public updateCameraPosition(node: CharacterBody3D) {
    const playerPos = node.global_position;

    if (this.isFirstPerson) {
      this.camera.position = playerPos.add(this.lookatOffset);
      this.camera.rotation.y = node.rotation.y;
    } else {
      const horizontalDistance =
        this.cameraDistance * Math.cos(this.cameraPitch);
      const verticalDistance = this.cameraDistance * Math.sin(this.cameraPitch);

      const offsetX = Math.sin(this.cameraYaw) * horizontalDistance;
      const offsetZ = Math.cos(this.cameraYaw) * horizontalDistance;

      this.cameraPosition.set(
        playerPos.x + offsetX,
        playerPos.y + this.cameraHeight + verticalDistance,
        playerPos.z + offsetZ,
      );

      this.camera.position = this.cameraPosition;
      this.camera.look_at(playerPos.add(this.lookatOffset), Vector3.UP);

      if (this.isPlayerMoving && !this.isCameraRotating) {
        this.cameraYaw = node.rotation.y + Math.PI / 2;
      }
    }
  }

  adjustCameraDistance(delta: number) {
    const node = this.getNode();
    if (!node) return;
    const deltaCoefficient = 0.2;
    this.cameraDistance = Math.max(
      this.minCameraDistance,
      Math.min(
        this.maxCameraDistance,
        this.cameraDistance + delta * deltaCoefficient,
      ),
    );
    this.isFirstPerson = this.cameraDistance <= this.minCameraDistance;
    this.updateCameraPosition(node as CharacterBody3D);
  }

  public input_pan(delta: number) {
    this.adjustCameraDistance(delta < 0 ? -1 : 1);
  }

  public useCollision(val: boolean) {
    console.log('Set collision', val);
    const node = this.getNode() as CharacterBody3D;
    if (!node) return;
  
    // Find the CollisionShape3D child
    const collisionShape = node.getNodesOfType(CollisionShape3D);
    if (collisionShape.length) {
      collisionShape.forEach((a) => a.disabled = !val); // Disable if val is false, enable if val is true
    } else {
      console.warn("No CollisionShape3D found!");
    }
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
