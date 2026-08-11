import { EntityKind } from "./entity-store.js";
import type { ZoneNpcSpawnDefinition } from "./zone-content.js";

interface PositionedEntity {
  readonly kind: number;
  readonly currentHp: number;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
}

export type MerchantInteractionResult =
  | { readonly ok: true; readonly definition: ZoneNpcSpawnDefinition }
  | { readonly ok: false; readonly message: string };

/** Authoritative merchant availability rule shared by both zone simulations. */
export function merchantInteraction(
  player: PositionedEntity | null | undefined,
  npc: PositionedEntity | null | undefined,
  definition: ZoneNpcSpawnDefinition | null | undefined,
  engaged: boolean,
): MerchantInteractionResult {
  if (!player || !npc || !definition?.merchant) {
    return { ok: false, message: "That NPC is not available as a merchant." };
  }
  if (npc.kind !== EntityKind.npc || npc.currentHp <= 0 || engaged) {
    return { ok: false, message: "That merchant is busy right now." };
  }
  const distance = Math.hypot(
    player.position.x - npc.position.x,
    player.position.y - npc.position.y,
    player.position.z - npc.position.z,
  );
  return distance <= definition.merchant.interactionRange
    ? { ok: true, definition }
    : { ok: false, message: "You are too far away from that merchant." };
}
