import type Player from "./player";
import {
  Vector3,
  Camera3D,
  CharacterBody3D,
  OmniLight3D,
  Color,
  Node3D,
  DisplayServer,
  Input,
  MouseButton,
} from "godot";

export class PlayerCamera {
  private player: Player;
  private camera: Camera3D;
  private isFirstPerson: boolean = false;
  private minCameraDistance: number = 1;
  private maxCameraDistance: number = 35;
  private cameraDistance: number = 13;
  private cameraHeight: number = 5;
  private cameraLight: OmniLight3D;

  private lookatOffset = new Vector3(0, 3, 0); // Head height for first-person
  private cameraPosition = new Vector3(0, 0, 0);
  private cameraPitch: number = 0;
  
  public isCameraRotating: boolean = false;
  public cameraYaw: number = 0;

  constructor(player: Player, camera: Camera3D) {
    this.player = player;
    this.camera = camera;
    const node = this.player.getNode() as Node3D;
    this.cameraLight = new OmniLight3D();
    this.cameraLight.position = new Vector3(0, 5, 0);
    this.cameraLight.light_color = new Color(1.0, 0.85, 0.6, 1.0);
    this.cameraLight.light_energy = 4.0;
    this.cameraLight.light_specular = 0.0;
    this.cameraLight.omni_range = 250.0;
    this.cameraLight.layers = 1 << 0;
    node?.add_child(this.cameraLight);
  }
  private reparentLight(newParent: Node3D) {
    const oldParent = this.cameraLight.get_parent() as Node3D | null;
    if (oldParent !== newParent) {
      if (oldParent) {
        oldParent.remove_child(this.cameraLight);
      }
      newParent.add_child(this.cameraLight);
    }
  }

  public mouseInputButton(buttonIndex: number) {
    if (buttonIndex === MouseButton.MOUSE_BUTTON_LEFT) {
      this.isCameraRotating = Input.is_mouse_button_pressed(
        MouseButton.MOUSE_BUTTON_LEFT,
      );
    }

    // In first-person, always capture mouse for free look
    if (this.isFirstPerson) {
      DisplayServer.mouse_set_mode(Input.MouseMode.MOUSE_MODE_CAPTURED);
    } else {
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

  public adjustCameraDistance(delta: number) {
    const node = this.player.getNode();
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

  public inputMouseMotion(x: number, y: number) {
    const node = this.player.getNode() as CharacterBody3D;
    if (!node) return;
  
    if (
      DisplayServer.mouse_get_mode() === Input.MouseMode.MOUSE_MODE_CAPTURED
    ) {
      // Sensitivity adjustments
      const yawSensitivity = 0.005;
      const pitchSensitivity = 0.005;
  
      // Update yaw and pitch
      this.cameraYaw -= x * yawSensitivity;
      this.cameraPitch += y * pitchSensitivity; // Reversed pitch as per previous fix
  
      // Clamp pitch to prevent flipping (90 degrees up/down)
      const maxPitch = Math.PI / 2 - 0.01; // Slight offset to avoid gimbal lock
      this.cameraPitch = Math.max(-maxPitch, Math.min(maxPitch, this.cameraPitch));
  
      if (this.isFirstPerson) {
        // In first-person, rotate player node on Y-axis to align movement
        //node.rotation = new Vector3(0, this.cameraYaw, 0); // Removed negative sign
        this.player.isPlayerMoving = true;
        node.rotate_y(-x * yawSensitivity);
        this.updateCameraPosition(node);
      } else {
        if (this.isCameraRotating) {
          // Third-person camera rotation around player
          this.updateCameraPosition(node);
        } else {
          // Rotate player and adjust camera yaw
          this.player.isPlayerMoving = true;
          node.rotate_y(-x * yawSensitivity);
          this.updateCameraPosition(node);
        }
      }
    }
  }
  
  public updateCameraPosition(node: CharacterBody3D) {
    const playerPos = node.global_position;
  
    if (this.isFirstPerson) {
      // Set player node invisible in first-person mode
      node.visible = false;
  
      // Position camera at player's head level
      this.camera.global_position = playerPos.add(this.lookatOffset);
      this.reparentLight(this.camera);
      // Apply pitch and yaw rotations to camera
      this.camera.rotation = new Vector3(
        -this.cameraPitch, // Negative for intuitive up/down
        this.cameraYaw, // Ensure camera yaw matches player
        0,
      );
    } else {
      this.reparentLight(node);

      // Make player node visible in third-person mode
      node.visible = true;
  
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
  
      if (this.player.isPlayerMoving && !this.isCameraRotating) {
        this.cameraYaw = node.rotation.y + Math.PI / 2;
      }
    }
  }
}