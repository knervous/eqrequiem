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
  private lookatOffset = new BABYLON.Vector3(0, 3, 0);
  private cameraPosition = new BABYLON.Vector3(0, 0, 0);
  private cameraPitch: number = 0;
  public cameraYaw: number = 0;

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
    this.cameraLight.specular = new BABYLON.Color3(0, 0, 0);
    this.cameraLight.range = 100.0;

    this.bindInputEvents();
    document.addEventListener(
      "pointerlockchange",
      this.onChangePointerLock,
      false,
    );
  }

  private bindInputEvents() {
    const canvas = this.player.gameManager.scene!.getEngine().getRenderingCanvas();
    if (!canvas) return;
    this.canvas = canvas;

    canvas.addEventListener("mousedown", (e) => {
      this.mouseInputButton(e.button);
    });
    canvas.addEventListener("mouseup", (e) => {
      this.mouseInputButton(e.button, true);
    });
    canvas.addEventListener("mousemove", (e) => {
      this.inputMouseMotion(e.movementX, e.movementY);
    });
    canvas.addEventListener("wheel", (e) => {
      const delta = e.deltaY > 0 ? 1 : -1;
      this.adjustCameraDistance(delta);
      e.preventDefault();
    });
  }

  private onChangePointerLock = () => {
    this.isLocked = !!document.pointerLockElement;
  };

  public mouseInputButton(buttonIndex: number, up: boolean = false) {
    if (!this.canvas) return;
    if (up && buttonIndex === 2) {
      document.exitPointerLock();
    } else if (buttonIndex === 2 && !this.isLocked && this.canvas.requestPointerLock) {
      try {
        this.canvas.requestPointerLock();
      } catch {}
    }
  }

  public attachPlayerLight(mesh: BJS.AbstractMesh) {
    if (!this.cameraLight) return;
    this.cameraLight.parent = mesh;
    const forward = mesh.getDirection(BABYLON.Axis.X).normalize();
    const heightOff = new BABYLON.Vector3(0, 2, 1);
    const forwardOff = forward.scale(-2);
    this.cameraLight.position = mesh.position.add(forwardOff).add(heightOff);
  }

  public adjustCameraDistance(delta: number) {
    if (!this.player.mesh) return;
    const deltaCoefficient = 0.2;
    this.cameraDistance = Math.max(
      this.minCameraDistance,
      Math.min(this.maxCameraDistance, this.cameraDistance + delta * deltaCoefficient),
    );
    this.isFirstPerson = this.cameraDistance <= this.minCameraDistance;
    this.updateCameraPosition();
  }

  public inputMouseMotion(x: number, y: number) {
    if (!this.player.mesh || !this.isLocked) return;

    const yawSensitivity = 0.005;
    const pitchSensitivity = 0.005;

    this.cameraYaw -= x * yawSensitivity;
    this.cameraPitch += y * pitchSensitivity;

    const maxPitch = Math.PI / 2 - 0.01;
    this.cameraPitch = Math.max(-maxPitch, Math.min(maxPitch, this.cameraPitch));

    this.player.isPlayerMoving = true;
    this.player.setRotation(this.cameraYaw);
    this.updateCameraPosition();
  }

  public updateCameraPosition() {
    const mesh = this.player.mesh;
    if (!mesh) return;
    const playerPos = mesh.position;

    if (this.isFirstPerson) {
      this.camera.position = playerPos.add(this.lookatOffset);
      this.camera.rotation = new BABYLON.Vector3(this.cameraPitch, this.cameraYaw, 0);
    } else {
      const hDist = this.cameraDistance * Math.cos(this.cameraPitch);
      const vDist = this.cameraDistance * Math.sin(this.cameraPitch);
      const forward = mesh.getDirection(BABYLON.Axis.X).scale(hDist);
      this.cameraPosition
        .copyFrom(playerPos)
        .addInPlace(new BABYLON.Vector3(0, this.cameraHeight + vDist, 0))
        .addInPlace(forward);
      this.camera.position = this.cameraPosition;
      this.camera.setTarget(playerPos.add(this.lookatOffset));
    }

    this.cameraLight.position = this.camera.position;
  }

  public dispose() {
    this.cameraLight.dispose();
    document.removeEventListener("pointerlockchange", this.onChangePointerLock, false);
  }
}