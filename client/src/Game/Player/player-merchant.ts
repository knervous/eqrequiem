import { addChatLine } from "@game/ChatCommands/chat-message";
import {
  MerchantBuy,
  MerchantOpen,
  MerchantSell,
} from "@game/Net/messages";
import { OpCodes } from "@game/Net/opcodes";
import { WorldSocket } from "@ui/net/instances";
import type Player from "./player";

/** Client intents only. Stock, ownership, quantities, and prices remain server-owned. */
export class PlayerMerchant {
  constructor(private readonly player: Player) {}

  async openTarget(): Promise<void> {
    const target = this.player.Target;
    if (
      !target?.spawn.isNpc
      || target.spawn.isCorpse
      || Number(target.spawn.charClass) !== 41
    ) {
      addChatLine("You must target a nearby merchant.");
      return;
    }
    await WorldSocket.sendStreamMessage(
      OpCodes.MerchantOpen,
      MerchantOpen,
      { npcId: target.spawn.spawnId },
    );
  }

  buy(npcId: number, merchantSlot: number, quantity = 1): Promise<void> {
    return WorldSocket.sendStreamMessage(OpCodes.MerchantBuy, MerchantBuy, {
      npcId,
      merchantSlot,
      quantity,
    });
  }

  sell(
    npcId: number,
    slot: number,
    bag: number,
    quantity = 1,
  ): Promise<void> {
    return WorldSocket.sendStreamMessage(OpCodes.MerchantSell, MerchantSell, {
      npcId,
      slot,
      bag,
      quantity,
    });
  }
}
