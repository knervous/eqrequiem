import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";
import type Player from "./player";

export class PlayerCamera {
  private player: Player;
  private camera: BJS.UniversalCamera;
  private cameraLight: BJS.PointLight;
  private isFirstPerson: boolean = false;
  private minCameraDistance: number = 1;
  private maxCameraDistance: number = 35;
  private cameraDistance: number = 13;
  private cameraHeight: number = 5;
  private canvas: HTMLCanvasElement | null = null;
  private isLocked: boolean = false;
  private lookatOffset = new BABYLON.Vector3(0, 3, 0); // Head height for first-person
  private cameraPosition = new BABYLON.Vector3(0, 0, 0);
  private cameraPitch: number = 0;
  public isCameraRotating: boolean = false;
  public cameraYaw: number = 0;

  // Mouse state tracking

  constructor(player: Player, camera: BJS.UniversalCamera) {
    this.player = player;
    this.camera = camera;
    this.cameraLight = new BABYLON.PointLight(
      "playerLight",
      new BABYLON.Vector3(0, 5, 0),
      this.player.gameManager.scene!,
    );
    this.onChangePointerLock = this.onChangePointerLock.bind(this);

    this.cameraLight.radius = 100;
    this.cameraLight.diffuse = new BABYLON.Color3(1.0, 0.85, 0.6);
    this.cameraLight.intensity = 25.0;
    this.cameraLight.specular = new BABYLON.Color3(0, 0, 0); // No specular
    this.cameraLight.range = 100.0;

    this.bindInputEvents();
    document.addEventListener(
      "pointerlockchange",
      this.onChangePointerLock,
      false,
    );
  }

  private bindInputEvents() {
    const canvas = this.player.gameManager
      .scene!.getEngine()
      .getRenderingCanvas();
    if (!canvas) return;
    this.canvas = canvas;
    // Mouse button events

    canvas.addEventListener("mousedown", (e) => {
      this.mouseInputButton(e.button);
    });
    canvas.addEventListener("mouseup", (e) => {
      this.mouseInputButton(e.button, true);
    });

    // Mouse motion
    canvas.addEventListener("mousemove", (e) => {
      this.inputMouseMotion(e.movementX, e.movementY);
    });

    // Mouse wheel
    canvas.addEventListener("wheel", (e) => {
      const delta = e.deltaY > 0 ? 1 : -1;
      this.adjustCameraDistance(delta);
      e.preventDefault();
    });
  }

  private onChangePointerLock = () => {
    const controlEnabled = document.pointerLockElement;
    if (!controlEnabled) {
      this.isLocked = false;
    } else {
      this.isLocked = true;
    }
  };

  public mouseInputButton(buttonIndex: number, up: boolean = false) {
    if (!this.canvas) {
      return;
    }
    this.isCameraRotating = buttonIndex === 0 && !up;
    if (up && buttonIndex === 2) {
      document.exitPointerLock();
    } else {
      if (
        buttonIndex === 2 &&
        !this.isLocked &&
        this.canvas.requestPointerLock
      ) {
        try {
          this.canvas.requestPointerLock();
        } catch {}
      }
    }
  }

  public attachPlayerLight(mesh: BJS.AbstractMesh) {
    if (!this.cameraLight) return;
    this.cameraLight.parent = mesh;
    const forward = mesh.getDirection(BABYLON.Axis.X).normalize();
    const heightOff = new BABYLON.Vector3(0, 2, 1);
    const forwardOff = forward.scale(-2); // 2 units in front

    this.cameraLight.position = mesh.position.add(forwardOff).add(heightOff);
  }

  public adjustCameraDistance(delta: number) {
    if (!this.player.mesh) return;
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

  public inputMouseMotion(x: number, y: number) {
    if (!this.player.mesh || !(this.isLocked || this.isCameraRotating)) return;

    // Sensitivity adjustments
    const yawSensitivity = 0.005;
    const pitchSensitivity = 0.005;

    // Update yaw and pitch
    this.cameraYaw -= x * yawSensitivity;
    this.cameraPitch += y * pitchSensitivity;

    // Clamp pitch to prevent flipping
    const maxPitch = Math.PI / 2 - 0.01;
    this.cameraPitch = Math.max(
      -maxPitch,
      Math.min(maxPitch, this.cameraPitch),
    );

    if (this.isFirstPerson || !this.isCameraRotating) {
      this.player.isPlayerMoving = true;
      this.player.setRotation(this.cameraYaw);
    } 
    this.updateCameraPosition();
  }

  public updateCameraPosition() {
    const mesh = this.player.mesh;
    if (!mesh) return;
    const playerPos = mesh.position;

    //mesh.isVisible = !this.isFirstPerson;
    const hDist = this.cameraDistance * Math.cos(this.cameraPitch);
    const vDist = this.cameraDistance * Math.sin(this.cameraPitch);

    if (this.isFirstPerson) {
      this.camera.position = playerPos.add(this.lookatOffset);
      this.camera.rotation = new BABYLON.Vector3(
        this.cameraPitch,
        this.cameraYaw - Math.PI / 2, // Add 90 degrees to yaw        0,
      );
      
    } else if (this.isCameraRotating) {
      const pivot = mesh.position.add(this.lookatOffset);

      const x = hDist * Math.sin(this.cameraYaw);
      const z = hDist * Math.cos(this.cameraYaw);
      const y = vDist;   // vertical offset *above* the lookat pivot
  
      this.camera.position = pivot.add(new BABYLON.Vector3(x, y, z));
      this.camera.setTarget(pivot);
    } else {
      
      const forward = mesh.getDirection(BABYLON.Axis.X).scale(hDist);
      this.cameraPosition
        .copyFrom(playerPos)
        .addInPlace(new BABYLON.Vector3(0, this.cameraHeight + vDist, 0))
        .addInPlace(forward);
      this.camera.position = this.cameraPosition;
      this.camera.setTarget(playerPos.add(this.lookatOffset));
    }

    //this.cameraLight.position = this.camera.position;
  }

  public dispose() {
    this.cameraLight.dispose();
    document.removeEventListener(
      "pointerlockchange",
      this.onChangePointerLock,
      false,
    );
    // Note: Camera disposal is handled externally if needed
  }
}
