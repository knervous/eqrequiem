import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";
import type Player from "./player";
import { Entity } from "@game/Model/entity";

export class PlayerCamera {
  private player: Player;
  private camera: BJS.UniversalCamera;
  private cameraLight: BJS.PointLight;
  public isFirstPerson: boolean = false;
  private minCameraDistance: number = 0.5;
  private maxCameraDistance: number = 35;
  private cameraDistance: number = 13;
  private preferredCameraDistance: number = 13;
  private cameraCollided: boolean = false;
  private cameraHeight: number = 5;
  private canvas: HTMLCanvasElement | null = null;
  private isLocked: boolean = false;
  private lookatOffset = new BABYLON.Vector3(0, 3, 0);
  private cameraPosition = new BABYLON.Vector3(0, 0, 0);
  private cameraPitch: number = 0;
  public cameraYaw: number = 0;
  private eventListeners: Array<{
    element: HTMLElement | Document;
    type: string;
    listener: EventListenerOrEventListenerObject;
  }> = [];

  constructor(player: Player, camera: BJS.UniversalCamera) {
    this.player = player;
    this.camera = camera;
    this.cameraLight = new BABYLON.PointLight(
      "playerLight",
      new BABYLON.Vector3(0, 5, 0),
      this.player.gameManager.scene!,
    );
    this.onChangePointerLock = this.onChangePointerLock.bind(this);
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleWheel = this.handleWheel.bind(this);

    this.cameraLight.radius = 100;
    this.cameraLight.diffuse = new BABYLON.Color3(1.0, 0.85, 0.6);
    this.cameraLight.intensity = 1200;
    this.cameraLight.specular = new BABYLON.Color3(0, 0, 0);
    this.cameraLight.range = 100.0;
    this.bindInputEvents();
  }

  private bindInputEvents() {
    const canvas = this.player.gameManager
      .scene!.getEngine()
      .getRenderingCanvas();
    if (!canvas) return;

    this.canvas = canvas;

    // Store event listeners for later removal
    this.eventListeners.push(
      { element: canvas, type: "mousedown", listener: this.handleMouseDown },
      { element: canvas, type: "mouseup", listener: this.handleMouseUp },
      { element: canvas, type: "mousemove", listener: this.handleMouseMove },
      { element: canvas, type: "wheel", listener: this.handleWheel },
      {
        element: document,
        type: "pointerlockchange",
        listener: this.onChangePointerLock,
      },
    );

    // Add event listeners
    this.eventListeners.forEach(({ element, type, listener }) => {
      element.addEventListener(type, listener, false);
    });
  }

  private handleMouseDown = (e: MouseEvent) => {
    this.mouseInputButton(e.button, false, e.offsetX, e.offsetY);
  };

  private handleMouseUp = (e: MouseEvent) => {
    this.mouseInputButton(e.button, true);
  };

  private handleMouseMove = (e: MouseEvent) => {
    this.inputMouseMotion(e.movementX, e.movementY);
  };

  private handleWheel = (e: WheelEvent) => {
    const charSelect = !!this.player.gameManager.CharacterSelect?.character;
    if (charSelect) {
      return;
    }
    const delta = e.deltaY > 0 ? 1 : -1;
    this.adjustCameraDistance(delta);
  };

  private onChangePointerLock = () => {
    this.isLocked = !!document.pointerLockElement;
  };

  private visualizeRay(ray: BJS.Ray, pickResult: BJS.PickingInfo | null) {
    const scene = this.player.gameManager.scene!;
    const rayLength = 100; // Adjust based on your scene scale
    const origin = ray.origin.clone();
    let endPoint: BJS.Vector3;
    const hit = pickResult?.hit && pickResult.pickedPoint;

    if (hit) {
      // If there's a hit, end the ray at the hit point
      endPoint = pickResult!.pickedPoint!.clone();
    } else {
      // Otherwise, extend the ray to the maximum length
      endPoint = origin.add(ray.direction.scale(rayLength));
    }
    // Create a line to represent the ray
    const points = [origin, endPoint];
    const color = hit
      ? new BABYLON.Color4(0, 1, 0, 0)
      : new BABYLON.Color4(1, 0, 0, 0); // Green for hit, red for miss
    const line = BABYLON.MeshBuilder.CreateLines(
      `ray_${Date.now()}`, // Unique name
      { points, colors: [color, color] },
      scene,
    );

    if (hit) {
      const sphere = BABYLON.MeshBuilder.CreateSphere(
        `hit_${Date.now()}`,
        { diameter: 0.5 * 2 }, // Scale with entity
        scene,
      );
      sphere.position = pickResult!.pickedPoint!.clone();
      sphere.material = new BABYLON.StandardMaterial(
        `hitMat_${Date.now()}`,
        scene,
      );
      (sphere.material as BJS.StandardMaterial).diffuseColor =
        new BABYLON.Color3(0, 1, 0);
      setTimeout(() => {
        sphere.dispose();
        (sphere.material as BJS.StandardMaterial).dispose();
      }, 10000);
    }

    // Dispose of the line after 1 second
    setTimeout(() => {
      line.dispose();
    }, 10000);
  }
  leftButtonDown: boolean = false;
  rightButtonDown: boolean = false;
  public mouseInputButton(
    buttonIndex: number,
    up: boolean = false,
    x: number = 0,
    y: number = 0,
  ) {
    if (!this.canvas) return;
    const charSelect = !!this.player.gameManager.CharacterSelect?.character;
    if (charSelect) {
      return;
    }
    const scene = this.player.gameManager.scene!;

    if (buttonIndex === 0) {
      this.leftButtonDown = !up;
    }
    if (buttonIndex === 2) {
      this.rightButtonDown = !up;
    }
    if (!this.player.playerMovement) return;
    if (this.leftButtonDown && this.rightButtonDown) {
      this.player.playerMovement!.moveForward = true;
      return;
    }
    this.player.playerMovement!.moveForward = false;

    if (!up && buttonIndex === 0 && scene && !this.isLocked) {
      const pickRay = this.player.gameManager.scene!.createPickingRay(
        x,
        y,
        BABYLON.Matrix.Identity(),
        this.camera,
        false,
      );
      const pickResult = this.player.gameManager.scene!.pickWithRay(
        pickRay,
        (mesh) => !!mesh.metadata?.entity,
        true,
      );
      // For debugging
      // this.visualizeRay(pickRay, pickResult);
      if (pickResult?.hit && pickResult.pickedMesh?.metadata?.entity) {
        this.player.Target = pickResult.pickedMesh.metadata.entity;
      }
    }
    if (up && buttonIndex === 2) {
      document.exitPointerLock();
    } else if (
      buttonIndex === 2 &&
      !this.isLocked &&
      this.canvas.requestPointerLock
    ) {
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
    if (!this.player.playerEntity) return;
    const deltaCoefficient = 1.2;
    this.preferredCameraDistance = Math.max(
      this.minCameraDistance,
      Math.min(
        this.maxCameraDistance,
        this.preferredCameraDistance + delta * deltaCoefficient,
      ),
    );
    this.isFirstPerson = this.preferredCameraDistance <= this.minCameraDistance;
    if (this.player.gameManager.SecondaryCamera !== null) {
      this.player.playerEntity.toggleVisibility(true);
    } else {
      this.player.playerEntity.toggleVisibility(!this.isFirstPerson);
    }
    this.updateCameraPosition();
  }

  public inputMouseMotion(x: number, y: number) {
    if (!this.player.playerEntity || !this.isLocked) return;
    const charSelect = !!this.player.gameManager.CharacterSelect?.character;
    if (charSelect) {
      return;
    }

    const yawSensitivity = 0.005;
    const pitchSensitivity = 0.005;

    this.cameraYaw -= x * yawSensitivity;
    if (this.isFirstPerson) {
      this.cameraPitch -= y * pitchSensitivity;
    } else {
      this.cameraPitch += y * pitchSensitivity;
    }

    const maxPitch = Math.PI / 2 - 0.01;
    this.cameraPitch = Math.max(
      -maxPitch,
      Math.min(maxPitch, this.cameraPitch),
    );

    this.player.isPlayerMoving = true;
    this.player.setRotation(this.cameraYaw);
    this.updateCameraPosition();
  }

  private checkCollision(entity: Entity): boolean {
    const plugin = this.player.physicsPlugin;
    const position = this.player.playerEntity?.spawnPosition;
    if (!position) {
      return false;
    }
    const result = new BABYLON.PhysicsRaycastResult();

    plugin.raycast(this.camera.position, position, result);

    if (
      result.hasHit &&
      result.body?.motionType === BABYLON.PhysicsMotionType.STATIC
    ) {
      return true;
    }

    if (this.cameraCollided) {
      const hDist = this.preferredCameraDistance * Math.cos(this.cameraPitch);
      const vDist = this.preferredCameraDistance * Math.sin(this.cameraPitch);
      const forward = entity.getDirection(BABYLON.Axis.X).scale(hDist);
      const camPosition = this.cameraPosition.clone();
      camPosition
        .copyFrom(position)
        .addInPlace(new BABYLON.Vector3(0, this.cameraHeight + vDist, 0))
        .addInPlace(forward);
      plugin.raycast(camPosition, position, result);
      if (
        !(
          result.hasHit &&
          result.body?.motionType === BABYLON.PhysicsMotionType.STATIC
        )
      ) {

        this.cameraCollided = false;

      }
    }
    return false;
  }

  public updateCameraPosition() {
    const entity = this.player.playerEntity;
    if (!entity) return;
    const playerPos = entity.spawnPosition.clone();

    // Physics check - keep within bounds of collidable world
    if (this.checkCollision(entity)) {
      this.cameraDistance = Math.max(
        this.minCameraDistance,
        this.cameraDistance - 2,
      );
      this.cameraDistance += 0.1; // Adjust to prevent jitter
    } else if (!this.cameraCollided && Math.abs(this.cameraDistance - this.preferredCameraDistance) > 0.1) {
      this.cameraCollided = true;
      this.cameraDistance = BABYLON.Scalar.Lerp(
        this.cameraDistance,
        this.preferredCameraDistance,
        0.1,
      );
    }


    if (this.isFirstPerson) {
      this.camera.position = playerPos.add(this.lookatOffset);
      this.camera.rotation = new BABYLON.Vector3(
        this.cameraPitch,
        this.cameraYaw + BABYLON.Tools.ToRadians(90),
        0,
      );
    } else {
      const hDist = this.cameraDistance * Math.cos(this.cameraPitch);
      const vDist = this.cameraDistance * Math.sin(this.cameraPitch);
      const forward = entity.getDirection(BABYLON.Axis.X).scale(hDist);
      this.cameraPosition
        .copyFrom(playerPos)
        .addInPlace(new BABYLON.Vector3(0, this.cameraHeight + vDist, 0))
        .addInPlace(forward);
      this.camera.position = this.cameraPosition;
      this.camera.setTarget(playerPos.add(this.lookatOffset));
    }

    this.cameraLight.position = this.camera.position;
    this.camera.rotation.z = 0;
  }

  public dispose() {
    // Remove all event listeners
    this.eventListeners.forEach(({ element, type, listener }) => {
      element.removeEventListener(type, listener, false);
    });
    this.eventListeners = [];

    // Dispose of the camera light
    this.cameraLight.dispose();

    // Clear canvas reference
    this.canvas = null;
  }
}
