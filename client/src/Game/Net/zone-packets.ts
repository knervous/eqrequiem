import GameManager from "@game/Manager/game-manager";
import { WorldSocket } from "@ui/net/instances";
import { OpCodes } from "./opcodes";
import { NewZone } from "./internal/api/capnp/zone";
import { PlayerProfile } from "./internal/api/capnp/player";


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

  @opCodeHandler(OpCodes.NewZone, NewZone)
  newZone(newZone: NewZone) {

    GameManager.instance.loadZoneServer(newZone);
    this.setMode('game');

  }

  @opCodeHandler(OpCodes.PlayerProfile, PlayerProfile)
  loadPlayerProfile(playerProfile: PlayerProfile) {
    console.log('Got player profile', playerProfile);

    GameManager.instance.instantiatePlayer(playerProfile);

    
    // //GameManager.instance.instantiatePlayer(playerProfile);
    // GameManager.instance.setLoading(false);
  }

}
