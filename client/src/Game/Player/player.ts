import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";
import type GameManager from "@game/Manager/game-manager";

import RACE_DATA from "../Constants/race-data";
import { PlayerMovement } from "./player-movement";
import { PlayerCamera } from "./player-cam";
import { PlayerProfile } from "@game/Net/internal/api/capnp/player";
import { ItemInstance } from "@game/Net/internal/api/capnp/item";
import { InventorySlot } from "./player-constants";
import { AnimationDefinitions } from "@game/Animation/animation-constants";
import EntityCache from "@game/Model/entity-cache";
import { Entity } from "@game/Model/entity";
import emitter from "@game/Events/events";
import { PlayerKeyboard } from "./player-keyboard";
export default class Player {
  public playerMovement: PlayerMovement | null = null;
  public playerCamera: PlayerCamera;
  public playerKeyboard: PlayerKeyboard;
  public player: PlayerProfile | null = null;
  public playerEntity: Entity | null = null;
  public isPlayerMoving: boolean = false;
  public gameManager: GameManager;
  public inventory: Map<InventorySlot, ItemInstance | null> = new Map();
  public model: string = "";
  public currentAnimation: string = "";
  public currentPlayToEnd: boolean = false;
  private inGame: boolean = true;

  private originalCollisionFilter = 0;
  private physicsBody: BJS.PhysicsBody | null = null;
  public get Target() {
    return this.target;
  }
  public set Target(target: Entity | null) {
    if (this.target) {
      this.target.setSelected(false);
    }
    this.target = target;
    emitter.emit("target", target);
    if (this.target) {
      let color = new BABYLON.Color4(1, 1, 1, 1);
      const levelDifference = this.target.spawn.level - this.player!.level;
      switch(true) {
        case levelDifference > 3:
          color = new BABYLON.Color4(1, 0, 0, 1); // Red for too high
          break;
        case levelDifference > 0 && levelDifference < 3:
          color = new BABYLON.Color4(1, 1, 0, 1); // Yellow for slightly higher
          break;
        case levelDifference === 0:
          color = new BABYLON.Color4(1, 1, 1, 1); // White for same level
          break;
        case levelDifference < 0 && levelDifference > -3:
          color = new BABYLON.Color4(0, 0, 1, 1); // Blue for slightly lower
          break;
        case levelDifference <= -3:
          color = new BABYLON.Color4(0, 1, 0, 1); // Green for too low
          break;
        default:
          break;
      }
      this.target.setSelected(true, color);
    }
  }
  private target: Entity | null = null;

  static instance: Player | null = null;

  private raycastTickCounter: number = 0;
  private readonly raycastCheckInterval: number = 10;

  constructor(
    gameManager: GameManager,
    camera: BJS.UniversalCamera,
    inGame: boolean = true,
  ) {
    this.inGame = inGame;
    this.gameManager = gameManager;
    this.playerCamera = new PlayerCamera(this, camera);
    this.playerKeyboard = new PlayerKeyboard(this, gameManager.scene!);
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
    if (this.playerKeyboard) {
      this.playerKeyboard.dispose();
    }
  }

  public getPlayerRotation() {
    return this.playerEntity?.rotationQuaternion?.toEulerAngles() ?? BABYLON.Vector3.Zero();
  }

  public getPlayerPosition() {
    return this.playerEntity?.spawnPosition;
  }

  public inputMouseButton(buttonIndex: number) {
    this.playerCamera.mouseInputButton(buttonIndex);
  }

  public inputMouseMotion(x: number, y: number) {
    this.playerCamera.inputMouseMotion(x, y);
  }

  public setGravity(on: boolean) {
    if (this.playerEntity?.physicsBody) {
      this.playerEntity.physicsBody.setGravityFactor(on ? 1 : 0);
      console.log(
        `[Player] Gravity set to ${on ? "enabled" : "disabled"} for player ${this.player?.name}`,
      );
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

    // New raycast logic
    this.raycastTickCounter++;
    if (this.raycastTickCounter >= this.raycastCheckInterval) {
      this.raycastTickCounter = 0; // Reset counter
      this.checkBelowAndReposition();
    }
  }

  // Updated method using physics raycast
  private checkBelowAndReposition() {
    if (!this.playerEntity || !this.gameManager.scene) {
      return;
    }

    const physics = this.gameManager.scene.getPhysicsEngine();
    const plugin = physics?.getPhysicsPlugin() as BJS.HavokPlugin;
    if (!physics || !plugin) {
      console.warn("[Player] Physics engine or Havok plugin not available");
      return;
    }

    const position = this.playerEntity.spawnPosition;
    if (!position) {
      return;
    }
    const rayOrigin = new BABYLON.Vector3(position.x, position.y, position.z);
    const result = new BABYLON.PhysicsRaycastResult();

    // Downward raycast
    const downEnd = rayOrigin.add(new BABYLON.Vector3(0, -1000, 0)); // 10 units down
    plugin.raycast(rayOrigin, downEnd, result);

    if (!result.hasHit) {
      // No static body below, cast upward
      const upEnd = rayOrigin.add(new BABYLON.Vector3(0, 10000, 0)); // 100 units up
      result.reset();
      plugin.raycast(rayOrigin, upEnd, result);

      if (result.hasHit && result.body?.motionType === BABYLON.PhysicsMotionType.STATIC) {
        // Reposition player just below the hit point
        const hitPoint = result.hitPoint;
        const newPosition = new BABYLON.Vector3(hitPoint.x, hitPoint.y - 0.1, hitPoint.z);
        this.setPosition(newPosition.x, newPosition.y + 5, newPosition.z);
        console.log(`[Player] Repositioned to ${newPosition.toString()} due to no ground below`);
      }
    }
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

  public setPosition(x: number, y: number, z: number) {
    if (!this.playerEntity) {
      return;
    }
    const physicsBody = this.playerEntity.physicsBody;
    if (!physicsBody) {
      return;
    }

    const plugin = this.gameManager
      .scene!.getPhysicsEngine()!
      .getPhysicsPlugin() as BJS.HavokPlugin;

    plugin._hknp.HP_Body_SetPosition(
      physicsBody._pluginData.hpBodyId,
      [x, y, z],
    );
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
    if (this.playerEntity) {
      await this.playerEntity.dispose();
      this.playerEntity = null;
    }
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
    //player.y = player.z = player.x = 15;
    const playerEntity = await EntityCache.getInstance(this.gameManager, player, this.gameManager.scene!, container);
    if (!playerEntity) {
      console.error("[Player] Failed to create player entity");
      return;
    }
    this.playerEntity = playerEntity;
    await playerEntity.initialize();
    await playerEntity.instantiateSecondaryMesh(this.headModelName, 0);
    if (this.inGame) {
      this.playerMovement = new PlayerMovement(this, this.gameManager.scene!);
    }
 
    this.gameManager.scene?.registerBeforeRender(() => {
      this.tick();
    });


    // Emit events
    emitter.emit("playerName", this.player.name);
  }

  public playAnimation(
    animationName: string,
    playThrough: boolean = true,
  ) {
    this.playerEntity?.playAnimation(animationName, playThrough);
  


  }

  public playPos() {
    this.playAnimation(AnimationDefinitions.None, true);
  }
  public playStationaryJump() {
    this.playAnimation(AnimationDefinitions.StationaryJump, true);
  }

  public playJump() {
    this.playAnimation(AnimationDefinitions.RunningJump, true);
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
    this.playAnimation(AnimationDefinitions.Idle2, false);
  }
}