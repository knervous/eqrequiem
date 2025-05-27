import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";
import type GameManager from "@game/Manager/game-manager";

import RACE_DATA from "../Constants/race-data";
import { LoaderOptions } from "@game/GLTF/base";
import { PlayerMovement } from "./player-movement";
import { PlayerCamera } from "./player-cam";
import { PlayerProfile } from "@game/Net/internal/api/capnp/player";
import { Spawn } from "@game/Net/internal/api/capnp/common";
import { ItemInstance } from "@game/Net/internal/api/capnp/item";
import { InventorySlot, MaterialPrefixes } from "./player-constants";
import AssetContainer from "@game/Model/asset-container";
import { AnimationDefinitions } from "@game/Animation/animation-constants";
import { createNameplate, swapMaterialTexture } from "@game/Model/bjs-utils";
import { zoneData } from "@game/Constants/zone-data";
import { CLASS_DATA_NAMES } from "@game/Constants/class-data";
import { FileSystem } from "@game/FileSystem/filesystem";
import { BabylonTextureCache } from "@game/Model/bjs-texture-cache";

export default class Player extends AssetContainer {
  public playerMovement: PlayerMovement | null = null;
  public playerCamera: PlayerCamera;
  public player: PlayerProfile | null = null;
  public isPlayerMoving: boolean = false;
  public mesh: BJS.Mesh | null = null;
  public gameManager: GameManager;
  public inventory: Map<InventorySlot, ItemInstance | null> = new Map();
  public model: string = "";
  public currentAnimation: string = "";
  public currentPlayToEnd: boolean = false;
  private inGame: boolean = true;
  private capsuleShapePool: Map<number, BJS.PhysicsShapeCapsule> = new Map();
  private currentCapsuleHeight: number = 5.5; // Track current height
  private readonly heightChangeThreshold: number = 0.01; // Tolerance for height matching
  private readonly maxStepHeight: number = 2.0; // Max height to step over (e.g., 0.3 meters)
  private readonly stepHeightTolerance: number = 0.01; // Tolerance for height comparisons
  private originalCollisionFilter = 0;

  private animations: Record<string, BJS.AnimationGroup> = {};
  private physicsBody: BJS.PhysicsBody | null = null;
  public get Target() {
    return this.target;
  }
  public set Target(target: Spawn | null) {
    this.target = target;
    if (target) {
      this.observers["target"].forEach((obs) => obs(target));
    }
  }
  private target: Spawn | null = null;

  static instance: Player | null = null;

  static playerOptions: Partial<LoaderOptions> = {
    flipTextureY: true,
    shadow: false,
    useCapsulePhysics: true,
  };

  constructor(
    gameManager: GameManager,
    camera: BJS.UniversalCamera,
    inGame: boolean = true,
  ) {
    super("models", inGame);
    this.inGame = inGame;
    this.gameManager = gameManager;
    this.playerCamera = new PlayerCamera(this, camera);
    Player.instance = this;
    (window as any).player = this;
  }

  private observers: Record<string, ((any) => void)[]> = {};

  public addObserver(name: string, observer: (any) => void) {
    if (!this.observers[name]) {
      this.observers[name] = [];
    }
    this.observers[name].push(observer);
  }

  public removeObserver(name: string, observer: (any) => void) {
    if (this.observers[name]) {
      this.observers[name] = this.observers[name].filter(
        (obs) => obs !== observer,
      );
    }
  }

  public async dispose(disposeContainer: boolean = true) {
    if (this.physicsBody) {
      this.physicsBody.dispose();
      this.physicsBody = null;
    }
    for (const shape of this.capsuleShapePool.values()) {
      shape.dispose();
    }
    this.capsuleShapePool.clear();
    if (this.mesh) {
      if (this.mesh.material) {
        // Handle single material
        if (this.mesh.material instanceof BABYLON.MultiMaterial) {
          // Dispose of each sub-material in MultiMaterial
          this.mesh.material.subMaterials.forEach((subMaterial) => {
            if (subMaterial) {
              subMaterial.dispose();
            }
          });
        } else {
          // Dispose of single material
          this.mesh.material.dispose();
        }
        this.mesh.material.getActiveTextures();
        // Clear the material reference
        this.mesh.material = null;
      }
      const nameplate = this.mesh
        .getChildren(undefined, false)
        .find((m) => m.name === "namePlate");
      if (nameplate) {
        nameplate?.dispose?.(false, true);
      }
      this.mesh.dispose();
      this.mesh = null;
    }
    if (this.playerCamera) {
      this.playerCamera.dispose();
    }
    if (this.model && disposeContainer) {
      super.disposeModel(this.model);
    }
  }

  public getPlayerRotation() {
    return this.mesh?.rotation;
  }

  public getPlayerPosition() {
    return this.mesh?.position;
  }

  public inputMouseButton(buttonIndex: number) {
    this.playerCamera.mouseInputButton(buttonIndex);
  }

  public inputMouseMotion(x: number, y: number) {
    this.playerCamera.inputMouseMotion(x, y);
  }

  public setGravity(on: boolean) {
    if (this.physicsBody) {
      this.physicsBody.setGravityFactor(on ? 1 : 0);
    }
  }

  public setCollision(on: boolean) {
    if (this.physicsBody?.shape) {
      this.physicsBody.shape.filterCollideMask = on ? this.originalCollisionFilter : 8;
    }
  }

  public tick() {
    const delta =
      (this.gameManager.scene?.getEngine().getDeltaTime() ?? 0) / 1000;
    this.playerMovement?.movementTick?.(delta);
  }

  public input_pan(delta: number) {
    this.playerCamera.adjustCameraDistance(delta < 0 ? -1 : 1);
  }

  private get headVariation(): number {
    if (!this.player) {
      return 0;
    }
    return this.inventory.get(InventorySlot.Head)?.item?.itemtype ?? 0;
  }

  private get headModelName(): string {
    const variation = this.headVariation.toString().padStart(2, "0") ?? "00";
    return `${this.model.slice(0, 3)}he${variation}`;
  }

  public setRotation(yaw: number) {
    if (!this.physicsBody || !this.mesh) {
      return;
    }
    const normalized = ((yaw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const q = BABYLON.Quaternion.RotationYawPitchRoll(normalized, 0, 0);
    this.mesh.rotationQuaternion = q;
    const plugin = this.gameManager
      .scene!.getPhysicsEngine()!
      .getPhysicsPlugin() as BJS.HavokPlugin;

    plugin._hknp.HP_Body_SetOrientation(
      this.physicsBody._pluginData.hpBodyId,
      q.asArray(),
    );
  }

  public SwapFace(index: number) {
    if (!this.mesh) {
      return;
    }
    if (this.mesh.material instanceof BABYLON.MultiMaterial) {
      // Dispose of each sub-material in MultiMaterial
      this.mesh.material.subMaterials.forEach((subMaterial) => {
        if (subMaterial?.name.includes("he00")) {
          const newTexture = subMaterial.name.replace(
            /he00\d{1}/,
            `${MaterialPrefixes.Face}00${index}`,
          );
          swapMaterialTexture(subMaterial, newTexture);
        }
      });
    }
  }

  public async UpdateNameplate(lines: string[]) {
    if (!this.mesh) {
      return;
    }
    const nameplate = this.mesh
      .getChildren(undefined, false)
      .find((m) => m.name === "namePlate");
    if (nameplate) {
      nameplate.dispose(false, true);
    }
    createNameplate(this.gameManager.scene!, this.mesh, lines);
  }

  private updateCapsuleHeightFromBounds() {
    if (!this.mesh || !this.physicsBody || !this.gameManager.scene) {
      return;
    }

    // Wait for the next frame to ensure animation has applied
    this.gameManager.scene.onAfterRenderObservable.addOnce(() => {
      if (!this.mesh || !this.physicsBody || !this.gameManager.scene) {
        return;
      }
      this.mesh.computeWorldMatrix(true);
      const { min, max } = this.mesh.getHierarchyBoundingVectors(true);
      const newHeight = max.y - min.y;
      const capsuleRadius = 0.5;
      const effectiveHeight = Math.max(newHeight, capsuleRadius * 2);

      // Check if a shape with this height (within threshold) exists in the pool
      let selectedShape: BJS.PhysicsShapeCapsule | null = null;
      for (const [pooledHeight, shape] of this.capsuleShapePool) {
        if (
          Math.abs(effectiveHeight - pooledHeight) < this.heightChangeThreshold
        ) {
          selectedShape = shape;
          break;
        }
      }

      // If no matching shape, create a new one and add to pool
      if (!selectedShape) {
        const pointA = new BABYLON.Vector3(
          0,
          effectiveHeight / 2 - capsuleRadius,
          0,
        );
        const pointB = new BABYLON.Vector3(
          0,
          -(effectiveHeight / 2 - capsuleRadius),
          0,
        );
        selectedShape = new BABYLON.PhysicsShapeCapsule(
          pointA,
          pointB,
          capsuleRadius,
          this.gameManager.scene,
        );
        this.originalCollisionFilter = selectedShape.filterCollideMask;
        selectedShape.material.friction = 0.0;
        selectedShape.material.restitution = 0.0;
        this.capsuleShapePool.set(effectiveHeight, selectedShape);
      }

      // Store physics state
      const currentPosition = this.mesh.position.clone();
      const currentVelocity = this.physicsBody.getLinearVelocity();
      const currentAngularVelocity = this.physicsBody.getAngularVelocity();

      // Assign new or pooled shape
      this.physicsBody.shape = selectedShape;
      this.currentCapsuleHeight = effectiveHeight;

      // Restore physics state
      this.physicsBody.setLinearVelocity(currentVelocity);
      this.physicsBody.setAngularVelocity(currentAngularVelocity);
      this.mesh.position = currentPosition;
    });
  }

  private setupStepClimbing() {
    if (!this.physicsBody || !this.mesh) {
      return;
    }

    if (this.physicsBody.shape) {
      this.physicsBody.shape.material.friction = 0.1;
      this.physicsBody.shape.material.restitution = 0.0;
    }

    this.physicsBody.setCollisionCallbackEnabled(true);
    this.physicsBody.getCollisionObservable().add((event: BJS.IPhysicsCollisionEvent) => {
      if (!this.mesh || !event.collidedAgainst || !event.point || !this.gameManager.scene) {
        return;
      }

      const movement = this.playerMovement!;
      const intendedVelocity = new BABYLON.Vector3(
        movement.finalVelocity?.x || 0,
        0,
        movement.finalVelocity?.z || 0,
      );

      // Use forward direction if no intended velocity (fallback)
      const moveDirection = intendedVelocity.length() > 0
        ? intendedVelocity.normalize()
        : BABYLON.Vector3.Forward().rotateByQuaternionToRef(
          this.mesh.rotationQuaternion || BABYLON.Quaternion.Identity(),
          new BABYLON.Vector3(),
        ).set(0, 0, 1).normalize();

      const halfHeight = this.currentCapsuleHeight / 2;
      const baseY = this.mesh.position.y - halfHeight;

      const footOrigin = new BABYLON.Vector3(
        this.mesh.position.x,
        baseY + this.stepHeightTolerance,
        this.mesh.position.z,
      );
      const stepOrigin = new BABYLON.Vector3(
        this.mesh.position.x,
        baseY + this.maxStepHeight + this.stepHeightTolerance,
        this.mesh.position.z,
      );

      // Cast rays in the intended movement direction
      const rayLength = 0.75; // Short length for precise detection
      const footRay = new BABYLON.Ray(footOrigin, moveDirection, rayLength);
      const stepRay = new BABYLON.Ray(stepOrigin, moveDirection, rayLength);

      const footHit = this.gameManager.scene.pickWithRay(footRay, (mesh) => mesh !== this.mesh);
      const stepHit = this.gameManager.scene.pickWithRay(stepRay, (mesh) => mesh !== this.mesh);

      // Check for valid step condition
      if (footHit?.hit && footHit.pickedPoint && !stepHit?.hit) {
        const obstacleHeight = footHit.pickedPoint.y - baseY;

        if (obstacleHeight > 0 && obstacleHeight <= this.maxStepHeight) {
          const plugin = this.gameManager.scene.getPhysicsEngine()!.getPhysicsPlugin() as BJS.HavokPlugin;
          const bodyId = this.physicsBody!._pluginData.hpBodyId;
          const newPosition = this.mesh.position.clone();
          newPosition.y += 1;

          plugin._hknp.HP_Body_SetPosition(bodyId, [newPosition.x, newPosition.y, newPosition.z]);
        }
      }
    });
  }

  public async Load(player: PlayerProfile, charCreate: boolean = false) {
    this.player = player;
    this.currentAnimation = "";
    for (const item of this.player.inventoryItems?.toArray() ?? []) {
      this.inventory.set(item.slot, item);
    }
    if (!this.player) {
      console.warn("[Player] No player data available");
      return;
    }
    const race = this.player?.race ?? 1;
    const raceDataEntry = RACE_DATA[race];
    const model = raceDataEntry[this.player?.gender ?? 0] || raceDataEntry[2];
    this.model = model;
    const container = await this.getContainer(model, this.gameManager.scene!);
    if (!container) {
      console.warn(`[Player] Failed to load container ${model}`);
      return;
    }
    const rootNode = container.rootNodes[0] as BJS.Mesh;
    rootNode.name = `Player`;
    rootNode.position.setAll(0);
    rootNode.scaling.set(1, 1, 1);
    rootNode.rotationQuaternion = null;
    rootNode.rotation.setAll(0);
    container.animationGroups.forEach((anim) => {
      anim.name = anim.name.replace("Clone of ", "");
      this.animations[anim.name] = anim;
    });
    const instanceSkeleton = container.skeletons[0];
    const skeletonRoot = rootNode.getChildren(undefined, true)[0];

    const secondaryContainer = await this.getContainer(
      this.headModelName,
      this.gameManager.scene!,
    );
    if (!secondaryContainer) {
      console.warn(`[Player] Failed to load container ${this.headModelName}`);
      return;
    }
    const secondaryModel = container.instantiateModelsToScene();
    const secondaryRootNode = secondaryContainer.rootNodes[0];
    secondaryRootNode.getChildMeshes().forEach((m) => {
      m.parent = rootNode;
    });

    this.mesh = BABYLON.Mesh.MergeMeshes(
      rootNode.getChildMeshes(false),
      true,
      true,
      undefined,
      true,
      true,
    );

    secondaryModel.dispose();

    if (!this.mesh) {
      console.warn(`[Player] Failed to merge meshes`);
      return;
    }

    skeletonRoot.parent = this.mesh;
    // rootNode.dispose();
    this.mesh.skeleton = instanceSkeleton;
    this.mesh.rotation.y = Math.PI;
    this.mesh.id = "Player";
    this.mesh.name = player.name;


    // Let's try using the atlas
    // const atlasWebp = await FileSystem.getFileBytes('eqrequiem/atlas', `${this.model}.webp`);
    // const atlasJson = await FileSystem.getFileJson('eqrequiem/atlas', `${this.model}.json`);
    // console.log('Atlas WebP:', atlasWebp);
    // console.log('Atlas JSON:', atlasJson);
   
    console.log("Player xyz", player.x, player.y, player.z);
    // this.mesh.position = new BABYLON.Vector3(
    //   (player.x ?? 0) * -1,
    //   player.z ?? 5,
    //   player.y ?? 0,
    // );
    this.mesh.position = new BABYLON.Vector3(0, 15, 0);
    if (this.usePhysics) {
      this.mesh.scaling.setAll(1.5);
    }

    // Light
    this.playerCamera.attachPlayerLight(this.mesh);
    this.mesh.computeWorldMatrix(true);

    // Create Havok physics body with capsule shape
    if (this.usePhysics) {
      const capsuleRadius = 0.5;
      const capsuleHeight = 5.5;
      const pointA = new BABYLON.Vector3(
        0,
        capsuleHeight / 2 - capsuleRadius,
        0,
      );
      const pointB = new BABYLON.Vector3(
        0,
        -(capsuleHeight / 2 - capsuleRadius),
        0,
      );

      const capsuleShape = new BABYLON.PhysicsShapeCapsule(
        pointA,
        pointB,
        capsuleRadius,
        this.gameManager.scene!,
      );

      this.physicsBody = new BABYLON.PhysicsBody(
        this.mesh,
        BABYLON.PhysicsMotionType.DYNAMIC,
        false,
        this.gameManager.scene!,
      );
      this.physicsBody.shape = capsuleShape;
      this.physicsBody.setMassProperties({
        mass: 50,
        inertia: new BABYLON.Vector3(0, 0, 0),
      });
      this.mesh.physicsBody = this.physicsBody;
      this.setupStepClimbing();
      this.playerMovement = new PlayerMovement(this, this.gameManager.scene!);
    }
    createNameplate(
      this.gameManager.scene!,
      this.mesh,
      !this.usePhysics && charCreate
        ? ["Soandso"]
        : this.inGame
          ? [this.player.name]
          : [
            this.player.name,
            `Level ${this.player.level} ${CLASS_DATA_NAMES[this.player.charClass]}`,
            `${zoneData.find((z) => z.zone === player?.zoneId)?.longName ?? "Unknown Zone"}`,
          ],
    );

    this.SwapFace(player.face);
    if (this.usePhysics) {
      this.gameManager.scene?.registerBeforeRender(() => {
        this.tick();
      });
    }
  }

  /**
   * Animations
   */
  /**
   * Plays an animation by name, with optional looping and play-to-end behavior.
   * @param animationName - Name of the animation to play.
   * @param loop - Whether the animation should loop (default: true).
   * @param playToEnd - If true, prevents other animations from playing until this one finishes.
   */
  public playAnimation(
    animationName: string,
    loop: boolean = true,
    playToEnd: boolean = false,
  ) {
    // Skip if no animations, same animation is already playing, or locked by playToEnd
    if (
      !this.animations ||
      animationName === this.currentAnimation ||
      this.currentPlayToEnd
    ) {
      return;
    }

    // Check if the animation exists
    const animationGroup = this.animations[animationName];
    if (!animationGroup) {
      console.warn(`[Player] Animation ${animationName} not found`);
      return;
    }

    // Stop the current animation
    if (this.currentAnimation && this.animations[this.currentAnimation]) {
      this.animations[this.currentAnimation].stop();
    }

    // Set up play-to-end logic
    if (playToEnd) {
      this.currentPlayToEnd = true;
      animationGroup.onAnimationGroupEndObservable.addOnce(() => {
        this.currentPlayToEnd = false;
        this.currentAnimation = ""; // Allow new animations
        this.updateCapsuleHeightFromBounds(); // Update height when animation ends
      });
    }

    // Play the new animation
    animationGroup.start(loop);
    this.currentAnimation = animationName;
    this.updateCapsuleHeightFromBounds(); // Update height when animation ends

    // Send animation update to server (if applicable)
    if (this.player) {
      // WorldSocket.sendMessage(OpCodes.Animation, EntityAnimation, {
      //   spawnId: this.data?.spawnId,
      //   animation: animationName,
      // });
    }
  }

  /**
   * Specific animation methods
   */
  public playPos() {
    this.playAnimation(AnimationDefinitions.None, true, true);
  }
  public playStationaryJump() {
    this.playAnimation(AnimationDefinitions.StationaryJump, false, true);
  }

  public playJump() {
    this.playAnimation(AnimationDefinitions.RunningJump, false, true);
  }

  public playWalk() {
    this.playAnimation(AnimationDefinitions.Walking, true);
  }

  public playRun() {
    this.playAnimation(AnimationDefinitions.Running, true);
  }

  public playDuckWalk() {
    this.playAnimation(AnimationDefinitions.DuckWalking, false);
  }

  public playShuffle() {
    this.playAnimation(AnimationDefinitions.ShuffleRotate, false);
  }

  public playIdle() {
    this.playAnimation(AnimationDefinitions.Idle2, true);
  }
}
