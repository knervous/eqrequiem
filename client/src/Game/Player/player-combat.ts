import { addChatLine } from '@game/ChatCommands/chat-message';
import { AnimationDefinitions } from '@game/Animation/animation-constants';
import { Skills, ActiveCombatSkills } from '@game/Constants/skills';
import emitter from '@game/Events/events';
import {
  AutoAttack,
  ClientPositionUpdate,
  LootItem,
  LootRequest,
  type CombatEvent,
} from '@game/Net/messages';
import { OpCodes } from '@game/Net/opcodes';
import { InventorySlot } from '@game/Player/player-constants';
import type { ActionButtonData } from '@ui/components/game/action-button/constants';
import { WorldSocket } from '@ui/net/instances';
import type Player from './player';

export class PlayerCombat {
  private autoAttacking = false;

  constructor(private player: Player) {}

  public get AutoAttacking(): boolean {
    return this.autoAttacking;
  }

  public async toggleAutoAttack(): Promise<void> {
    if (this.autoAttacking) {
      await this.requestAutoAttack(false, this.player.Target?.spawn.spawnId ?? 0);
      return;
    }
    const target = this.player.Target;
    if (!target?.spawn.isNpc || !target.spawn.spawnId) {
      addChatLine('You must target a living enemy before attacking.');
      return;
    }
    if ((target.spawn.currentHp ?? 1) <= 0) {
      addChatLine(`${target.cleanName} is already defeated.`);
      return;
    }
    await this.requestAutoAttack(true, target.spawn.spawnId);
  }

  public targetChanged(previousTargetId: number, nextTargetId: number): void {
    if (this.autoAttacking && previousTargetId !== nextTargetId) {
      void this.requestAutoAttack(false, previousTargetId);
    }
  }

  public handleCombatEvent(event: CombatEvent): void {
    const attacker =
      this.player.gameManager.ZoneManager?.EntityPool?.entities[event.attackerId];
    if (attacker?.spawn.isNpc && event.outcome !== 'started') {
      if (event.outcome === 'hit') {
        addChatLine(
          `${attacker.cleanName} hits you for ${event.damage} point${event.damage === 1 ? '' : 's'} of damage.`,
        );
        if (event.killed) this.setAutoAttacking(false);
      } else if (event.outcome === 'miss') {
        addChatLine(`${attacker.cleanName} misses you.`);
      }
      return;
    }
    switch (event.outcome) {
      case 'started':
        this.setAutoAttacking(true);
        return;
      case 'stopped':
      case 'invalid-target':
        this.setAutoAttacking(false);
        if (event.outcome === 'invalid-target') {
          addChatLine('You can no longer attack that target.');
        }
        return;
      case 'out-of-range':
        addChatLine('Your target is too far away.');
        return;
      case 'miss':
        this.playSwingAnimation();
        addChatLine(`You miss ${this.targetName(event.targetId)}.`);
        return;
      case 'hit':
        this.playSwingAnimation();
        addChatLine(
          `You hit ${this.targetName(event.targetId)} for ${event.damage} point${event.damage === 1 ? '' : 's'} of damage.`,
        );
        if (event.killed) {
          this.setAutoAttacking(false);
          addChatLine(`${this.targetName(event.targetId)} has been defeated.`);
        }
        return;
    }
  }

  public reset(): void {
    this.setAutoAttacking(false);
  }

  public async lootTarget(): Promise<void> {
    const target = this.player.Target;
    if (!target?.spawn.isCorpse || !target.spawn.spawnId) {
      addChatLine('You must target a nearby corpse to loot it.');
      return;
    }
    try {
      await WorldSocket.sendStreamMessage(
        OpCodes.CorpseLootRequest,
        LootRequest,
        { corpseId: target.spawn.spawnId },
      );
    } catch (error) {
      console.error('Failed to request corpse loot', error);
      addChatLine('Unable to loot that corpse right now.');
    }
  }

  public async lootItem(corpseId: number, lootSlot: number): Promise<void> {
    try {
      await WorldSocket.sendStreamMessage(OpCodes.CorpseLootItem, LootItem, {
        corpseId,
        lootSlot,
      });
    } catch (error) {
      console.error('Failed to loot item', error);
      addChatLine('Unable to loot that item right now.');
    }
  }

  private async requestAutoAttack(
    enabled: boolean,
    targetId: number,
  ): Promise<void> {
    const previous = this.autoAttacking;
    this.setAutoAttacking(enabled);
    try {
      if (enabled) {
        const position = this.player.getPlayerPosition();
        const entity = this.player.playerEntity;
        if (position && entity) {
          await WorldSocket.sendStreamMessage(
            OpCodes.ClientUpdate,
            ClientPositionUpdate,
            {
              x: position.x,
              y: position.y,
              z: position.z,
              heading: entity.getHeading(),
              animation: entity.currentAnimation,
            },
          );
        }
      }
      await WorldSocket.sendStreamMessage(OpCodes.AutoAttack, AutoAttack, {
        enabled,
        targetId,
      });
    } catch (error) {
      this.setAutoAttacking(previous);
      console.error('Failed to update auto attack state', error);
      addChatLine('Unable to update auto attack right now.');
    }
  }

  private setAutoAttacking(value: boolean): void {
    if (this.autoAttacking === value) return;
    this.autoAttacking = value;
    emitter.emit('autoAttack', value);
  }

  private playSwingAnimation(): void {
    const weaponType =
      this.player.playerInventory.get(InventorySlot.Primary)?.itemtype;
    const animation = (() => {
      switch (weaponType) {
        case 1:
        case 35:
          return AnimationDefinitions.Slash2h;
        case 2:
          return AnimationDefinitions.Pierce1h;
        case 4:
          return AnimationDefinitions.Blunt2h;
        case 0:
        case 3:
          return AnimationDefinitions.Slash1h;
        default:
          return AnimationDefinitions.HandToHandPrimary;
      }
    })();
    this.player.playAnimation(animation, true);
  }

  private targetName(targetId: number): string {
    const target =
      this.player.gameManager.ZoneManager?.EntityPool?.entities[targetId];
    return target?.cleanName ?? 'your target';
  }

  public doCombatAction(actionData: ActionButtonData<Skills>) {
    switch (actionData.data) {
      case ActiveCombatSkills[Skills.Kick]:
        break;
      case ActiveCombatSkills[Skills.ApplyPoison]:
        break;
      case ActiveCombatSkills[Skills.Backstab]:
        break;
      case ActiveCombatSkills[Skills.Bash]:
        break;
      case ActiveCombatSkills[Skills.Disarm]:
        break;
      case ActiveCombatSkills[Skills.DragonPunchTailRake]:
        break;
      case ActiveCombatSkills[Skills.DualWield]:
        break;
      case ActiveCombatSkills[Skills.EagleStrike]:
        break;
      case ActiveCombatSkills[Skills.Evocation]:
        break;
      case ActiveCombatSkills[Skills.FlyingKick]:
        break;
      case ActiveCombatSkills[Skills.RoundKick]:
        break;
      default: break;
    }
  }
}
