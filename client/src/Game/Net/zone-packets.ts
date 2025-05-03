import Player from "@game/Player/player";
import GameManager from "@game/Manager/game-manager";
import * as EQMessage from "@eqmessage";
import { MessageType } from "@protobuf-ts/runtime";
import { WorldSocket } from "@ui/net/instances";


export function opCodeHandler(opCode: EQMessage.OpCodes, type: MessageType<any>): MethodDecorator {
  return (target: object, propertyKey: string | symbol) => {
    const ctor = target.constructor as any;
    if (!ctor.opCodeHandlers) {
      ctor.opCodeHandlers = new Map<string, MessageType<any>>();
    }
    ctor.opCodeHandlers.set(opCode, [propertyKey, type]);
  };
}

export class ZonePacketHandler {
  private opCodeHandlers: Map<EQMessage.OpCodes, [string, MessageType<any>]>;

  constructor(private setMode: React.Dispatch<React.SetStateAction<string>>) {
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

  @opCodeHandler(EQMessage.OpCodes.OP_NewZone, EQMessage.NewZone)
  newZone(newZone: EQMessage.NewZone) {

    GameManager.instance.loadZoneServer(newZone);
    this.setMode('game');

  }

  @opCodeHandler(EQMessage.OpCodes.OP_PlayerProfile, EQMessage.PlayerProfile)
  loadPlayerProfile(playerProfile: EQMessage.PlayerProfile) {
    console.log('Got player profile', playerProfile);

    GameManager.instance.instantiatePlayer(playerProfile);

    
    // //GameManager.instance.instantiatePlayer(playerProfile);
    // GameManager.instance.setLoading(false);
  }

}
