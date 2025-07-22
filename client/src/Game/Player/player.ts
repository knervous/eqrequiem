import type * as BJS from '@babylonjs/core';
import BABYLON from '@bjs';
import { AnimationDefinitions } from '@game/Animation/animation-constants';
import { capnpToPlainObject } from '@game/Constants/util';
import emitter from '@game/Events/events';
import type GameManager from '@game/Manager/game-manager';
import { Entity } from '@game/Model/entity';
import EntityCache from '@game/Model/entity-cache';
import { MoveItem } from '@game/Net/internal/api/capnp/common';
import { PlayerProfile } from '@game/Net/internal/api/capnp/player';
import {
  ActionButtonData,
  ActionType,
} from '@ui/components/game/action-button/constants';
import RACE_DATA from '../Constants/race-data';
import { PlayerAbility } from './player-ability';
import { PlayerCamera } from './player-cam';
import { PlayerCombat } from './player-combat';
import { InventorySlot } from './player-constants';
import { PlayerInventory } from './player-inventory';
import { PlayerKeyboard } from './player-keyboard';
import { PlayerMovement } from './player-movement';
import { PlayerSocials } from './player-socials';

export default class Player {
  public gameManager: GameManager;
  private inGame: boolean = true;

  public playerMovement: PlayerMovement | null = null;
  public playerCamera: PlayerCamera;
  public playerKeyboard: PlayerKeyboard;
  public playerCombat: PlayerCombat;
  public playerAbility: PlayerAbility;
  public playerSocials: PlayerSocials;
  public playerInventory: PlayerInventory;

  static instance: Player | null = null;

  public player: PlayerProfile | null = null;
  public playerEntity: Entity | null = null;
  public isPlayerMoving: boolean = false;
  public model: string = '';
  public currentAnimation: string = '';
  public currentPlayToEnd: boolean = false;

  private originalCollisionFilter = 0;
  private raycastTickCounter: number = 0;
  private readonly raycastCheckInterval: number = 10;

  /**
   * Running
   */
  private running: boolean = true;
  public get Running() {
    return this.running;
  }
  public set Running(value: boolean) {
    this.running = value;
    emitter.emit('playerRunning', value);
  }

  /**
   * Sitting
   */
  private sitting: boolean = false;
  public get Sitting() {
    return this.sitting;
  }
  public set Sitting(value: boolean) {
    this.sitting = value;
    emitter.emit('playerSitting', value);
    if (this.playerEntity) {
    }
  }

  /**
   * Target
   */
  private target: Entity | null = null;
  public get Target() {
    return this.target;
  }
  public set Target(target: Entity | null) {
    if (this.target) {
      this.target.setSelected(false);
    }
    this.target = target;
    emitter.emit('target', target);
    if (this.target) {
      let color = new BABYLON.Color4(1, 1, 1, 1);
      const levelDifference = this.target.spawn.level - this.player!.level;
      switch (true) {
        case levelDifference > 3:
          color = new BABYLON.Color4(1, 0, 0, 1);
          break;
        case levelDifference > 0 && levelDifference < 3:
          color = new BABYLON.Color4(1, 1, 0, 1);
          break;
        case levelDifference === 0:
          color = new BABYLON.Color4(1, 1, 1, 1);
          break;
        case levelDifference < 0 && levelDifference > -3:
          color = new BABYLON.Color4(0, 0, 1, 1);
          break;
        case levelDifference <= -3:
          color = new BABYLON.Color4(0, 1, 0, 1);
          break;
        default:
          break;
      }
      this.target.setSelected(true, color);
    }
  }

  public get hasCursorItem() {
    return this.playerInventory.get(InventorySlot.Cursor) !== null;
  }

  constructor(
    gameManager: GameManager,
    camera: BJS.UniversalCamera,
    inGame: boolean = true,
  ) {
    this.inGame = inGame;
    this.gameManager = gameManager;
    this.playerCamera = new PlayerCamera(this, camera);
    this.playerKeyboard = new PlayerKeyboard(this, gameManager.scene!);
    this.playerCombat = new PlayerCombat(this);
    this.playerAbility = new PlayerAbility(this);
    this.playerSocials = new PlayerSocials(this);
    this.playerInventory = new PlayerInventory(this);

    Player.instance = this;
    (window as any).player = this;
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
    if (this.playerMovement) {
      this.playerMovement.dispose();
      this.playerMovement = null;
    }
    this.gameManager.scene?.unregisterBeforeRender(this.tick.bind(this));
  }

  public getPlayerRotation() {
    return (
      this.playerEntity?.rotationQuaternion?.toEulerAngles() ??
      BABYLON.Vector3.Zero()
    );
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
        `[Player] Gravity set to ${on ? 'enabled' : 'disabled'} for player ${this.player?.name}`,
      );
    }
  }

  public setCollision(on: boolean) {
    if (this.playerEntity?.physicsBody?.shape) {
      this.playerEntity.physicsBody.shape.filterCollideMask = on
        ? this.originalCollisionFilter
        : 8;
    }
  }

  public tick() {
    if (!this.playerEntity || !this.gameManager.scene || !this.playerMovement) {
      return;
    }
    const delta =
      (this.gameManager.scene?.getEngine().getDeltaTime() ?? 0) / 1000;
    this.playerMovement?.movementTick?.(delta);

    // New raycast logic
    this.raycastTickCounter++;
    if (this.raycastTickCounter >= this.raycastCheckInterval) {
      this.raycastTickCounter = 0; // Reset counter
      this.playerEntity.checkBelowAndReposition();
    }
  }

  private get headVariation(): number {
    if (!this.player) {
      return 0;
    }
    return 0; // this.playerInventory.getHeadSlot()?.itemtype ?? 0;
  }

  private get headModelName(): string {
    return this.headVariation.toString().padStart(2, '0') ?? '00';
  }

  public get physicsPlugin(): BJS.HavokPlugin {
    return this.gameManager
      .scene!.getPhysicsEngine()!
      .getPhysicsPlugin() as BJS.HavokPlugin;
  }

  public setRotation(yaw: number) {
    if (!this.playerEntity?.physicsBody) {
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

    plugin._hknp.HP_Body_SetPosition(physicsBody._pluginData.hpBodyId, [
      x,
      y,
      z,
    ]);
  }

  public async UpdateNameplate(lines: string[]) {
    if (!this.playerEntity) {
      console.warn('[Player] No player entity to update nameplate');
      return;
    }
    await this.playerEntity.instantiateNameplate(lines);
  }


  /**
   * Retrieves or creates a shared parent node on the scene
   * under which all entities will be bucketed.
   */
  private getOrCreateNodeContainer(scene: BJS.Scene): BJS.Node {
    const existing = scene.getNodeByName('playerNodeContainer');
    if (existing) {
      return existing as BJS.Node;
    }
    return new BABYLON.TransformNode('playerNodeContainer', scene);
  }

  public async Load(player: PlayerProfile, fromCharSelect: boolean = false) {
    if (this.playerEntity) {
      await this.playerEntity.dispose();
      this.playerEntity = null;
    }
    this.player = (player as any).testData
      ? player
      : (capnpToPlainObject(player) as PlayerProfile);
    console.log('player', this.player, player);
    this.currentAnimation = '';
    this.playerInventory.load();
    if (!this.player) {
      console.warn('[Player] No player data available');
      return;
    }
    const race = this.player?.race ?? 1;
    const raceDataEntry = RACE_DATA[race];

    const model = raceDataEntry[this.player?.gender ?? 0] || raceDataEntry[2];
    this.model = model;
    const container = this.getOrCreateNodeContainer(this.gameManager.scene!);
    // player.y = player.z = player.x = 15;
    const playerEntity = await EntityCache.getInstance(
      this.gameManager,
      player,
      this.gameManager.scene!,
      container,
    );
    if (!playerEntity) {
      console.error('[Player] Failed to create player entity');
      return;
    }
    this.playerEntity = playerEntity;
    await playerEntity.initialize();
    if (this.inGame) {
      this.playerMovement = new PlayerMovement(this, this.gameManager.scene!);
    }

    this.gameManager.scene?.registerBeforeRender(this.tick.bind(this));
    if (this.playerCamera.isFirstPerson && !fromCharSelect) {
      this.playerEntity.toggleVisibility(false);
    }

    // Emit events
    emitter.emit('playerName', this.player.name);
    emitter.emit('setPlayer', this.player);
    emitter.emit('playerLoaded');
  }

  public toggleAutoRun() {
    this.playerMovement?.toggleAutoRun();
  }

  public playAnimation(animationName: string, playThrough: boolean = true) {
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

  // Action types

  public doAction(actionData?: ActionButtonData) {
    if (!this.playerEntity) {
      console.warn('[Player] No player entity to perform action');
      return;
    }
    if (!actionData) {
      console.warn('[Player] No action data provided');
      return;
    }

    console.log('Action data', actionData);
    switch (actionData.action as ActionType) {
      case ActionType.MELEE_ATTACK:
        this.autoAttack();
        break;
      case ActionType.RANGED_ATTACK:
        this.rangedAttack();
        break;
      case ActionType.COMBAT:
        this.playerCombat.doCombatAction(actionData);
        break;
      case ActionType.ABILITY:
        this.playerAbility.doAbility(actionData);
        break;
      case ActionType.SOCIAL:
        this.playerSocials.doSocial(actionData);
        break;

      default:
        console.warn(`[Player] Unknown action type: ${actionData.type}`);
    }
  }

  public toggleSit() {
    this.Sitting = !this.Sitting;
  }

  public toggleWalk() {
    this.Running = !this.Running;
  }
  public autoAttack() {
    console.log('Autoattack');
  }

  public rangedAttack() {
    console.log('Ranged attack on');
  }

  public moveItem(item: MoveItem) {
    if (!this.playerInventory) {
      console.warn('[Player] No player inventory to move item');
      return;
    }

    // Do texture swap logic if needed
    // todo

    this.playerInventory.moveItem(item);
  }
}
