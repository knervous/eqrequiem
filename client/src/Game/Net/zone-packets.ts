import { addChatLine } from '@game/ChatCommands/chat-message';
import emitter from '@game/Events/events';
import type GameManager from '@game/Manager/game-manager';
import Player from '@game/Player/player';
import { InventorySlot } from '@game/Player/player-constants';
import { WorldSocket } from '@ui/net/instances';
import {
  ChannelMessage,
  EntityAnimation,
  EntityPositionUpdate,
  LevelUpdate,
  MoveItem,
  Spawn,
  Spawns,
} from './internal/api/capnp/common';
import {
  BulkDeleteItem,
  BulkItemPacket,
  DeleteItem,
  ItemInstance,
} from './internal/api/capnp/item';
import { PlayerProfile } from './internal/api/capnp/player';
import { NewZone } from './internal/api/capnp/zone';
import { OpCodes } from './opcodes';

export function opCodeHandler(opCode: OpCodes, type: any): MethodDecorator {
  return (target: object, propertyKey: string | symbol) => {
    const ctor = target.constructor as any;
    if (!ctor.opCodeHandlers) {
      ctor.opCodeHandlers = new Map<string, any>();
    }
    ctor.opCodeHandlers.set(opCode, [propertyKey, type]);
  };
}

export class ZonePacketHandler {
  private opCodeHandlers: Map<OpCodes, [string, any]>;

  constructor(private gameManager: GameManager) {
    const ctor = (this as any).constructor;
    this.opCodeHandlers = ctor.opCodeHandlers ?? new Map();
    for (const [opCode, [methodType, messageType]] of this.opCodeHandlers) {
      WorldSocket.registerOpCodeHandler(
        opCode,
        messageType,
        this[methodType].bind(this),
      );
    }
  }

  @opCodeHandler(OpCodes.NewZone, NewZone)
  newZone(newZone: NewZone) {
    console.log('Received new zone data', newZone);
    this.gameManager.loadZoneServer(newZone);
    emitter.emit('setMode', 'game');
  }

  @opCodeHandler(OpCodes.PlayerProfile, PlayerProfile)
  loadPlayerProfile(playerProfile: PlayerProfile) {
    console.log('Got player profile', playerProfile);
    this.gameManager.instantiatePlayer(playerProfile);
  }

  @opCodeHandler(OpCodes.BatchZoneSpawns, Spawns)
  loadBatchZoneSpawns(spawns: Spawns) {
    Promise.all(
      spawns.spawns.map((spawn) => {
        return this.gameManager.ZoneManager?.EntityPool?.AddSpawn(spawn);
      }),
    )
      .then(() => {
        emitter.emit('zoneSpawns');
      })
      .catch((err) => {
        console.error('Error adding spawns:', err);
      });
  }

  @opCodeHandler(OpCodes.ZoneSpawns, Spawn)
  loadZoneSpawns(spawn: Spawn) {
    console.log('Received spawn data', spawn);
    this.gameManager.ZoneManager?.EntityPool?.AddSpawn(spawn);
  }

  @opCodeHandler(OpCodes.Animation, EntityAnimation)
  updateSpawnAnimation(animation: EntityAnimation) {
    this.gameManager.ZoneManager?.EntityPool?.PlayAnimation(animation);
  }

  @opCodeHandler(OpCodes.SpawnPositionUpdate, EntityPositionUpdate)
  updateSpawnPosition(spawnUpdate: EntityPositionUpdate) {
    for (const update of spawnUpdate.updates) {
      this.gameManager.ZoneManager?.EntityPool?.UpdateSpawnPosition(update);
    }
  }

  @opCodeHandler(OpCodes.ChannelMessage, ChannelMessage)
  processChannelMessage(channelMessage: ChannelMessage) {
    const msg = {
      message: channelMessage.message,
      chanNum: channelMessage.chanNum,
      color  : '#ddd',
      type   : 0,
    };
    switch (channelMessage.chanNum) {
      case -1:
        msg.message = `[Server Message] '${channelMessage.message}'`;
        msg.color = '#00AAEE';
        break;
      case 0:
        if (channelMessage.sender === Player.instance?.player?.name) {
          return;
        }
        msg.message = channelMessage.sender
          ? `${channelMessage.sender} says, '${channelMessage.message}'`
          : channelMessage.message;
        break;
      default:
        break;
    }
    emitter.emit('chatMessage', msg);
  }

  @opCodeHandler(OpCodes.MoveItem, MoveItem)
  processMoveItem(item: MoveItem) {
    Player.instance?.moveItem(item);
  }

  @opCodeHandler(OpCodes.AddItemPacket, ItemInstance)
  processItemPacket(item: ItemInstance) {
    if (!Player.instance?.playerInventory) {
      return;
    }
    Player.instance.playerInventory.set(
      item.slot as InventorySlot,
      item,
      item.bagSlot,
    );
    emitter.emit('updateInventorySlot', {
      slot: item.slot as InventorySlot,
      bag : item.bagSlot,
    });
    addChatLine(`You have received an item: ${item.name}`);
  }

  @opCodeHandler(OpCodes.DeleteItems, BulkDeleteItem)
  processBulkDeleteItems(bulkDelete: BulkDeleteItem) {
    if (!Player.instance?.playerInventory) {
      return;
    }
    for (const item of bulkDelete.items ?? []) {
      Player.instance?.playerInventory?.delete(
        item.slot as InventorySlot,
        item.bag as number,
      );
    }
    addChatLine(`You have deleted ${bulkDelete.items.length} items.`);
  }

  @opCodeHandler(OpCodes.DeleteItem, DeleteItem)
  processDeleteItem(deleteItem: DeleteItem) {
    Player.instance?.playerInventory?.delete(
      deleteItem.slot as InventorySlot,
      deleteItem.bag as number,
    );
  }

  @opCodeHandler(OpCodes.ItemPacket, BulkItemPacket)
  processBulkItemPacket(bulkItem: BulkItemPacket) {
    if (!Player.instance?.playerInventory) {
      return;
    }
    for (const item of bulkItem.items ?? []) {
      Player.instance?.playerInventory?.set(
        item.slot as InventorySlot,
        item,
        item.bagSlot,
      );
      emitter.emit('updateInventorySlot', {
        slot: item.slot as InventorySlot,
        bag : item.bagSlot,
      });
    }
  }

  @opCodeHandler(OpCodes.LevelUpdate, LevelUpdate)
  processLevelUpdate(levelUpdate: LevelUpdate) {
    const player = Player.instance?.player;
    if (!player) {
      return;
    }
    player.level = levelUpdate.level;
    player.exp = levelUpdate.exp;
    emitter.emit('levelUpdate', levelUpdate.level);
    addChatLine(
      `You have gained a level! You are now level ${levelUpdate.level}.`,
    );
  }
}
