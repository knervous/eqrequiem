import {
  Camera3D,
  CharacterBody3D,
  OmniLight3D,
  Color,
  DisplayServer,
  Input,
  MouseButton,
  Node3D,
  Vector3,
} from "godot";
import Player from "./player";
  
export default class PlayerCamera {
  private camera: Camera3D;
  private player: Player;
  private isFirstPerson: boolean = false;
  private minCameraDistance: number = 1;
  private maxCameraDistance: number = 35;
  private cameraDistance: number = 13;
  private cameraHeight: number = 5;
  private cameraLight: OmniLight3D | null = null;
  private lookatOffset = new Vector3(0, 1, 0);
  private cameraPosition = new Vector3(0, 0, 0);
  private cameraPitch: number = 0;
  private cameraYaw: number = 0;
  private isCameraRotating: boolean = false;
  private lastPlayerPosition: SimpleVector3 = { x: 0, y: 0, z: 0 };
  private isPlayerMoving: boolean = false;
  
  constructor(camera: Camera3D, player: Player) {
    this.camera = camera;
    this.player = player;
  }
  
  private getNode(): CharacterBody3D | null {
    return this.player.getNode() as CharacterBody3D;
  }
  
  public createCameraLight(node: Node3D) {
    this.cameraLight = new OmniLight3D();
    this.cameraLight.position = new Vector3(0, 5, 0);
    this.cameraLight.light_color = new Color(1.0, 0.85, 0.6, 1.0);
    this.cameraLight.light_energy = 4.0;
    this.cameraLight.light_specular = 0.0;
    this.cameraLight.omni_range = 250.0;
    this.cameraLight.layers = 1 << 0;
    node.add_child(this.cameraLight);
  }
  
  public handleInput(buttonIndex: number) {
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
  
  public handleMouseMotion(x: number, y: number) {
    const node = this.getNode();
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
        this.updateCameraPosition();
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
        this.updateCameraPosition();
      }
    }
  }
  
  public updateCameraPosition() {
    const node = this.getNode();
    if (!node) return;
  
    const playerPos = node.global_position;
    const currentPos = this.player.getPlayerPosition();
    this.isPlayerMoving =
        currentPos.x !== this.lastPlayerPosition.x ||
        currentPos.y !== this.lastPlayerPosition.y ||
        currentPos.z !== this.lastPlayerPosition.z;
    this.lastPlayerPosition = {
      x: currentPos.x,
      y: currentPos.y,
      z: currentPos.z,
    };
  
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
  
  public adjustCameraDistance(delta: number) {
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
    this.updateCameraPosition();
  }
  
  public syncCameraYaw(rotationY: number) {
    this.cameraYaw = rotationY + Math.PI / 2;
    this.updateCameraPosition();
  }
}
  
  type SimpleVector3 = {
    x: number;
    y: number;
    z: number;
  };