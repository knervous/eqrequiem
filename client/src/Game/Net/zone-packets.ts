import { addChatLine } from "@game/ChatCommands/chat-message";
import emitter from "@game/Events/events";
import type GameManager from "@game/Manager/game-manager";
import Player from "@game/Player/player";
import { InventorySlot } from "@game/Player/player-constants";
import { WorldSocket } from "@ui/net/instances";
import {
  BulkDeleteItem,
  BulkItemPacket,
  ChannelMessage,
  DeleteItem,
  DeleteSpawn,
  EntityAnimation,
  EntityPositionUpdate,
  ItemInstance,
  LevelUpdate,
  MoveItem,
  NewZone,
  PlayerProfile,
} from "./messages";
import { OpCodes } from "./opcodes";
import { viewWorldStatePacket } from "./world-state";

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
  private zoneReady: Promise<void> = Promise.resolve();
  private zoneEpoch = 0;
  private playerLoaded = false;
  private spawnsLoaded = false;
  private zoneAssetsReady = false;
  private worldStateQueue: Promise<void> = Promise.resolve();

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
    WorldSocket.registerRawOpCodeHandler(
      OpCodes.SpawnPositionUpdate,
      this.updateRenderSnapshot.bind(this),
    );
    WorldSocket.registerRawOpCodeHandler(
      OpCodes.BatchZoneSpawns,
      (payload) => { void this.loadBatchWorldState(payload); },
    );
    WorldSocket.registerRawOpCodeHandler(
      OpCodes.ZoneSpawns,
      (payload) => { void this.loadWorldStateSpawn(payload); },
    );
  }

  private updateRenderSnapshot(payload: Uint8Array): void {
    if (!this.zoneAssetsReady) return;
    const packet = viewWorldStatePacket(payload);
    if (!packet) {
      console.warn("Rejected render snapshot with mismatched Shado schema");
      return;
    }
    void this.queueWorldState(packet);
  }

  @opCodeHandler(OpCodes.NewZone, NewZone)
  async newZone(newZone: NewZone) {
    console.log("Received new zone data", newZone);
    const epoch = ++this.zoneEpoch;
    this.playerLoaded = false;
    this.spawnsLoaded = false;
    this.zoneAssetsReady = false;
    this.worldStateQueue = Promise.resolve();
    const ready = this.gameManager.loadZoneServer(newZone);
    this.zoneReady = ready;
    await ready;
    if (epoch !== this.zoneEpoch || ready !== this.zoneReady) return;
    this.zoneAssetsReady = true;
    emitter.emit("setMode", "game");
  }

  @opCodeHandler(OpCodes.PlayerProfile, PlayerProfile)
  async loadPlayerProfile(playerProfile: PlayerProfile) {
    console.log("Got player profile", playerProfile);
    const epoch = this.zoneEpoch;
    const ready = this.zoneReady;
    await ready;
    if (epoch !== this.zoneEpoch || ready !== this.zoneReady) return;
    await this.gameManager.instantiatePlayer(playerProfile);
    if (epoch !== this.zoneEpoch) return;
    this.playerLoaded = true;
    this.completeZoneLoadIfReady();
  }

  private async loadBatchWorldState(payload: Uint8Array) {
    const packet = viewWorldStatePacket(payload);
    if (!packet?.full) {
      console.warn("Rejected non-full world bootstrap packet");
      return;
    }
    const epoch = this.zoneEpoch;
    const ready = this.zoneReady;
    await ready;
    if (epoch !== this.zoneEpoch || ready !== this.zoneReady) return;
    await this.queueWorldState(packet);
    if (epoch !== this.zoneEpoch) return;
    this.spawnsLoaded = true;
    this.completeZoneLoadIfReady();
    emitter.emit("zoneSpawns");
  }

  private async loadWorldStateSpawn(payload: Uint8Array) {
    const packet = viewWorldStatePacket(payload);
    if (!packet?.full) return;
    const epoch = this.zoneEpoch;
    const ready = this.zoneReady;
    await ready;
    if (epoch !== this.zoneEpoch || ready !== this.zoneReady) return;
    await this.queueWorldState(packet);
  }

  private queueWorldState(packet: NonNullable<ReturnType<typeof viewWorldStatePacket>>): Promise<void> {
    const epoch = this.zoneEpoch;
    this.worldStateQueue = this.worldStateQueue
      .catch(() => {})
      .then(async () => {
        if (epoch !== this.zoneEpoch) return;
        await this.gameManager.ZoneManager?.EntityPool?.ApplyWorldState(packet);
      });
    return this.worldStateQueue;
  }

  @opCodeHandler(OpCodes.DeleteSpawn, DeleteSpawn)
  removeZoneSpawn(spawn: DeleteSpawn) {
    this.gameManager.ZoneManager?.EntityPool?.RemoveSpawn(spawn.spawnId);
  }

  private completeZoneLoadIfReady(): void {
    if (this.playerLoaded && this.spawnsLoaded) {
      this.gameManager.completeZoneLoad();
    }
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
      color: "#ddd",
      type: 0,
    };
    console.log("Channel message received:", msg);
    switch (channelMessage.chanNum) {
      case -1:
        msg.message = `[Server Message] '${channelMessage.message}'`;
        msg.color = "#00AAEE";
        break;
      case 0:
        if (channelMessage.sender === Player.instance?.player?.name) {
          return;
        }
        msg.color = "#111";
        msg.message = channelMessage.sender
          ? `${channelMessage.sender} says, '${channelMessage.message}'`
          : channelMessage.message;
        break;
      default:
        break;
    }
    emitter.emit("chatMessage", msg);
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
    emitter.emit("updateInventorySlot", {
      slot: item.slot as InventorySlot,
      bag: item.bagSlot,
    });
    if (item.slot <= InventorySlot.Ammo) {
      void Player.instance.playerEntity?.updateModelTextures();
    }
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
    if (bulkDelete.items.some((item) => item.slot <= InventorySlot.Ammo)) {
      void Player.instance?.playerEntity?.updateModelTextures();
    }
    addChatLine(`You have deleted ${bulkDelete.items.length} items.`);
  }

  @opCodeHandler(OpCodes.DeleteItem, DeleteItem)
  processDeleteItem(deleteItem: DeleteItem) {
    Player.instance?.playerInventory?.delete(
      deleteItem.slot as InventorySlot,
      deleteItem.bag as number,
    );
    if (deleteItem.slot <= InventorySlot.Ammo) {
      void Player.instance?.playerEntity?.updateModelTextures();
    }
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
      emitter.emit("updateInventorySlot", {
        slot: item.slot as InventorySlot,
        bag: item.bagSlot,
      });
    }
    if (bulkItem.items.some((item) => item.slot <= InventorySlot.Ammo)) {
      void Player.instance?.playerEntity?.updateModelTextures();
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
    emitter.emit("levelUpdate", levelUpdate.level);
    addChatLine(
      `You have gained a level! You are now level ${levelUpdate.level}.`,
    );
  }
}
