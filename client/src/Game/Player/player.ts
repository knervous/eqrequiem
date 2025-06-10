import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";
import type GameManager from "@game/Manager/game-manager";

import RACE_DATA from "../Constants/race-data";
import { PlayerMovement } from "./player-movement";
import { PlayerCamera } from "./player-cam";
import { PlayerProfile } from "@game/Net/internal/api/capnp/player";
import { Spawn } from "@game/Net/internal/api/capnp/common";
import { ItemInstance } from "@game/Net/internal/api/capnp/item";
import { InventorySlot, MaterialPrefixes } from "./player-constants";
import { AnimationDefinitions } from "@game/Animation/animation-constants";
import { swapMaterialTexture } from "@game/Model/bjs-utils";
import { zoneData } from "@game/Constants/zone-data";
import { CLASS_DATA_NAMES } from "@game/Constants/class-data";
import EntityCache from "@game/Model/entity-cache";
import { Entity } from "@game/Model/entity";

export default class Player {
  public playerMovement: PlayerMovement | null = null;
  public playerCamera: PlayerCamera;
  public player: PlayerProfile | null = null;
  public playerEntity: Entity | null = null;
  public isPlayerMoving: boolean = false;
  public gameManager: GameManager;
  public inventory: Map<InventorySlot, ItemInstance | null> = new Map();
  public model: string = "";
  public currentAnimation: string = "";
  public currentPlayToEnd: boolean = false;
  private inGame: boolean = true;
  private capsuleShapePool: Map<number, BJS.PhysicsShapeCapsule> = new Map();
  private currentCapsuleHeight: number = 5.5;
  private readonly heightChangeThreshold: number = 0.01;
  private readonly maxStepHeight: number = 2.0;
  private readonly stepHeightTolerance: number = 0.01;
  private originalCollisionFilter = 0;
  private camera: BJS.UniversalCamera;
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

  constructor(
    gameManager: GameManager,
    camera: BJS.UniversalCamera,
    inGame: boolean = true,
  ) {
    this.inGame = inGame;
    this.gameManager = gameManager;
    this.playerCamera = new PlayerCamera(this, camera);
    this.camera = camera;
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

  public async dispose() {
    if (this.playerEntity) {
      this.playerEntity.dispose();
    }
    if (this.playerCamera) {
      this.playerCamera.dispose();
    }
  }

  public getPlayerRotation() {
    return this.playerEntity?.rotationQuaternion?.toEulerAngles() ?? BABYLON.Vector3.Zero();
  }

  public getPlayerPosition() {
    return this.playerEntity?.position;
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
    return this.headVariation.toString().padStart(2, "0") ?? "00";
  }

  public setRotation(yaw: number) {
    if (!this.playerEntity) {
      return;
    }
    console.log('[Player] Setting rotation to:', yaw);
    const physicsBody = this.playerEntity.physicsBody!;
    const normalized = ((yaw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const q = BABYLON.Quaternion.RotationYawPitchRoll(normalized, 0, 0);

    this.playerEntity.rotationQuaternion = q;
    const plugin = this.gameManager
      .scene!.getPhysicsEngine()!
      .getPhysicsPlugin() as BJS.HavokPlugin;

    plugin._hknp.HP_Body_SetOrientation(
      physicsBody._pluginData.hpBodyId,
      q.asArray(),
    );
    // Lock angular motion to prevent physics-induced rotation
    physicsBody.setAngularVelocity(BABYLON.Vector3.Zero());
    physicsBody.setAngularDamping(1.0); // High damping to resist rotation
  }

  public SwapFace(index: number) {
    // if (!this.mesh) {
    //   return;
    // }
    // if (this.mesh.material instanceof BABYLON.MultiMaterial) {
    //   this.mesh.material.subMaterials.forEach((subMaterial) => {
    //     if (subMaterial?.name.includes("he00")) {
    //       const newTexture = subMaterial.name.replace(
    //         /he00\d{1}/,
    //         `${MaterialPrefixes.Face}00${index}`,
    //       );
    //       swapMaterialTexture(subMaterial, newTexture);
    //     }
    //   });
    // }
  }

  public async UpdateNameplate(lines: string[]) {
    if (!this.playerEntity) {
      console.warn("[Player] No player entity to update nameplate");
      return;
    }
    await this.playerEntity.instantiateNameplate(lines);
  }

  /**
   * Retrieves or creates a shared parent node on the scene
   * under which all entities will be bucketed.
   */
  private getOrCreateNodeContainer(scene: BJS.Scene): BJS.Node {
    const existing = scene.getNodeByName("playerNodeContainer");
    if (existing) {
      return existing as BJS.Node;
    }
    return new BABYLON.TransformNode("playerNodeContainer", scene);
  }

  public async Load(player: PlayerProfile) {
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
    const container = this.getOrCreateNodeContainer(this.gameManager.scene!);
    player.y = player.z = player.x = 15;
    const playerEntity = await EntityCache.getInstance(player, this.gameManager.scene!, container);
    if (!playerEntity) {
      console.error("[Player] Failed to create player entity");
      return;
    }
    this.playerEntity = playerEntity;
    await playerEntity.initialize();
    await playerEntity.instantiateSecondaryMesh(this.headModelName, 0);
    this.playerMovement = new PlayerMovement(this, this.gameManager.scene!);
    
    this.SwapFace(player.face);
    this.gameManager.scene?.registerBeforeRender(() => {
      this.tick();
    });
    
  }

  public playAnimation(
    animationName: string,
    loop: boolean = true,
  ) {
    this.playerEntity?.playAnimation(animationName, loop);
  

    if (this.player) {
      // WorldSocket.sendMessage(OpCodes.Animation, EntityAnimation, {
      //   spawnId: this.data?.spawnId,
      //   animation: animationName,
      // });
    }
  }

  public playPos() {
    this.playAnimation(AnimationDefinitions.None, true);
  }
  public playStationaryJump() {
    this.playAnimation(AnimationDefinitions.StationaryJump, false);
  }

  public playJump() {
    this.playAnimation(AnimationDefinitions.RunningJump, false);
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