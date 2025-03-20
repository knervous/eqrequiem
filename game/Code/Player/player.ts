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

  constructor(folder: string, model: string, camera: Camera3D) {
    super(folder, model);
    this.camera = camera;
    this.createCameraLight();

    this.bindKeys();
  }

  bindKeys() {
    const actions = [
      { name: "move_forward", key: Key.KEY_W },
      { name: "move_backward", key: Key.KEY_S },
      { name: "turn_left", key: Key.KEY_A },
      { name: "turn_right", key: Key.KEY_D },
      { name: "move_up", key: Key.KEY_SPACE }, // Space to move up
      { name: "move_down", key: Key.KEY_X }, // Shift to move down
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

  private createCameraLight() {
    this.cameraLight = new OmniLight3D();
    this.camera.add_child(this.cameraLight);
    this.cameraLight.position = new Vector3(0, 0, 0);
    this.cameraLight.light_color = new Color(1.0, 0.85, 0.6, 1.0);
    this.cameraLight.light_energy = 2.0;
    this.cameraLight.light_specular = 0.0;
    this.cameraLight.omni_range = 150.0;
    this.cameraLight.layers = 1 << 0;
    this.cameraLight.shadow_enabled = true;
  }

  tick(delta: number) {
    const node = this.getNode() as CharacterBody3D;
    if (!node) return;

    // const label = node.get_node("/root/Zone/DebugUI/PlayerDetails") as RichTextLabel;
    // label.text = `Position: ${node.position.x.toFixed(2)} ${node.position.y.toFixed(2)} ${node.position.z.toFixed(2)}\nRotation: ${node.rotation.x.toFixed(2)} ${node.rotation.y.toFixed(2)} ${node.rotation.z.toFixed(2)}`;

    // Handle Turning
    let didTurn = false;
    if (Input.is_action_pressed("turn_left")) {
      didTurn = true;
      node.rotate_y(this.turn_speed * delta);
    }
    if (Input.is_action_pressed("turn_right")) {
      didTurn = true;
      node.rotate_y(-this.turn_speed * delta);
    }

    // Handle Movement Input
    this.movement.set(0, 0, 0);
    if (Input.is_action_pressed("move_forward")) {
      this.movement.z = -1; // Negative for forward in local space
    }
    if (Input.is_action_pressed("move_backward")) {
      this.movement.z = 1;
    }
    if (Input.is_action_pressed("move_up")) {
      this.movement.y = 1; // Positive Y for up
    }
    if (Input.is_action_pressed("move_down")) {
      this.movement.y = -1; // Negative Y for down
    }
    this.movement = this.movement.normalized();
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

    // Calculate velocity based on camera orientation for XZ, and direct Y input
    const [basisX, _basisY, basisZ] = Extensions.GetBasisZ(this.camera);
    this.forwardXZ.set(basisX, 0, basisZ);
    this.forwardXZ = this.forwardXZ.normalized();
    const up = this.vectorUp;
    const speedMod = Input.is_action_pressed("sprint")
      ? this.sprint_multiplier
      : 1.0;

    const movementXZScaled = this.movement.z * this.move_speed * speedMod;
    const movementYScaled = this.movement.y * this.move_speed * speedMod;

    const velocityXZ = this.forwardXZ.multiplyScalar(movementXZScaled);
    const velocityY = up.multiplyScalar(movementYScaled);
    this.velocity = velocityXZ.add(velocityY);

    node.velocity = this.velocity;
    node.move_and_slide();

    this.vectorUp.set(0, 1, 0);
    this.updateCameraPosition(node);
  }

  private updateCameraPosition(node: CharacterBody3D) {
    const playerPos = Extensions.GetPosition(node);
    const playerRot = Extensions.GetRotation(node);
    if (this.isFirstPerson) {
      this.camera.position = playerPos.add(this.lookatOffset);
      this.camera.rotation.y = playerRot.y;
    } else {
      const correctedAngle = playerRot.y + Math.PI / 2;
      const offsetX = Math.sin(correctedAngle) * this.cameraDistance;
      const offsetZ = Math.cos(correctedAngle) * this.cameraDistance;
      this.cameraPosition.set(
        playerPos.x + offsetX,
        playerPos.y + this.cameraHeight,
        playerPos.z + offsetZ
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
      Math.min(this.maxCameraDistance, this.cameraDistance + delta)
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

    node.scale = new Vector3(1.5, 1.5, 1.5);
    node.position = new Vector3(0, 5, 0);
    this.updateCameraPosition(node);
  }
}
