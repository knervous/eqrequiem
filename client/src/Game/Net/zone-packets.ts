import type GameManager from "@game/Manager/game-manager";
import { WorldSocket } from "@ui/net/instances";
import { OpCodes } from "./opcodes";
import { NewZone } from "./internal/api/capnp/zone";
import { PlayerProfile } from "./internal/api/capnp/player";
import { ChannelMessage, EntityAnimation, EntityPositionUpdate, Spawn } from "./internal/api/capnp/common";
import Player from "@game/Player/player";
import emitter from "@game/Events/events";

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
    emitter.emit("setMode", "game");
  }

  @opCodeHandler(OpCodes.PlayerProfile, PlayerProfile)
  loadPlayerProfile(playerProfile: PlayerProfile) {
    console.log('Got player profile', playerProfile);
    this.gameManager.instantiatePlayer(playerProfile);
  }

  @opCodeHandler(OpCodes.ZoneSpawns, Spawn)
  loadZoneSpawns(spawn: Spawn) {
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
      color: "#ddd",
      type: 0,
    };
    switch(channelMessage.chanNum) { 
      case -1:
        msg.message = `[Server Message] '${channelMessage.message}'`;
        msg.color = "#00AAEE";
        break;
      case 0:
        if (channelMessage.sender === Player.instance?.player?.name) {
          return;
        }
        msg.message = `${channelMessage.sender} says, '${channelMessage.message}'`;
        break;
      default:
        break;
    }
    emitter.emit("chatMessage", msg);
  }
}
