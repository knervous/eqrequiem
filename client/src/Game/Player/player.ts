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
    window.player = this;
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
      const nameplate = this.mesh.getChildren(undefined, false).find((m) => m.name === "namePlate");
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

  public tick(delta: number) {
    this.playerMovement?.movementTick?.(delta);
  }

  public input_pan(delta: number) {
    this.playerCamera.adjustCameraDistance(delta < 0 ? -1 : 1);
  }

  public setUseCollision(val: boolean) {
    if (this.mesh) {
      this.mesh.checkCollisions = val;
    }
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

  public SwapFace(index: number) {
    if (!this.mesh) {
      return;
    }
    if (this.mesh.material instanceof BABYLON.MultiMaterial) {
      // Dispose of each sub-material in MultiMaterial
      this.mesh.material.subMaterials.forEach((subMaterial) => { 
        if (subMaterial?.name.includes('he00')) {
          const newTexture = subMaterial.name.replace(/he00\d{1}/, `${MaterialPrefixes.Face}00${index}`);
          swapMaterialTexture(subMaterial, newTexture);
        }
      },
      );
    }
  }

  public async UpdateNameplate(lines: string[]) {
    if (!this.mesh) {
      return;
    }
    const nameplate = this.mesh.getChildren(undefined, false).find((m) => m.name === "namePlate");
    if (nameplate) {
      nameplate.dispose(false, true);
    }
    createNameplate(this.gameManager.scene!, this.mesh, lines);
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
    const rootNode = container.rootNodes[0];
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

    // Light
    this.playerCamera.attachPlayerLight(this.mesh);

    // Create Havok physics body with capsule shape
    if (this.usePhysics) {
      // Define capsule dimensions (adjust based on your model's scale)
      const capsuleRadius = 0.3; // Radius of the capsule ends
      const capsuleHeight = 2; // Total height including end caps
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

      // Create capsule shape
      const capsuleShape = new BABYLON.PhysicsShapeCapsule(
        pointA,
        pointB,
        capsuleRadius,
        this.gameManager.scene!,
      );

      // Create physics body
      this.physicsBody = new BABYLON.PhysicsBody(
        this.mesh,
        BABYLON.PhysicsMotionType.DYNAMIC,
        false,
        this.gameManager.scene!,
      );
      this.physicsBody.shape = capsuleShape;
      this.physicsBody.setMassProperties({
        mass: 70, // Mass in kg (e.g., average human weight)
      });
      this.mesh.physicsBody = this.physicsBody; // Link to mesh
      this.playerMovement = new PlayerMovement(this, this.gameManager.scene!);
    }
    this.mesh.computeWorldMatrix(true);
    createNameplate(
      this.gameManager.scene!,
      this.mesh,
      charCreate
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
      });
    }

    // Play the new animation
    animationGroup.start(loop);
    this.currentAnimation = animationName;

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
