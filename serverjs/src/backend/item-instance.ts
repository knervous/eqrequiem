import type { DatabaseRow } from "../db/backend.js";

export interface GameItemRow extends DatabaseRow {
  id: number; name: string; idfile: string; icon: number; material: number;
  color: number; itemtype: number; slots: number; ac: number; bagslots: number;
  classes: number; races: number; stackable: number; stacksize: number;
  maxcharges: number; weight: number; damage: number; delay: number;
  astr: number; asta: number; adex: number; aagi: number; aint: number;
  awis: number; acha: number; hp: number; mana: number; dr: number; mr: number;
  cr: number; fr: number; pr: number; haste: number; magic: number; nodrop: number;
}

/** One item wire projection shared by offline and network backends. */
export function toItemInstance(
  item: Partial<GameItemRow> & Pick<GameItemRow, "id" | "name">,
  slot: number,
  bagSlot: number,
  quantity = 1,
): Record<string, unknown> {
  const number = (key: keyof GameItemRow, fallback = 0) => Number(item[key] ?? fallback);
  const maxcharges = number("maxcharges");
  return {
    id: number("id"), itemId: number("id"), name: String(item.name), slot, bagSlot,
    idfile: String(item.idfile ?? ""), icon: number("icon"), material: number("material"),
    color: number("color"), itemtype: number("itemtype", 10), slots: number("slots"),
    ac: number("ac"), bagslots: number("bagslots"), classes: number("classes", 65535),
    races: number("races", 4294967295), stackable: number("stackable"),
    stacksize: number("stacksize", 1), maxcharges, quantity, charges: maxcharges > 0 ? 1 : 0,
    weight: number("weight"), damage: number("damage"), delay: number("delay"),
    astr: number("astr"), asta: number("asta"), adex: number("adex"),
    aagi: number("aagi"), aint: number("aint"), awis: number("awis"), acha: number("acha"),
    hp: number("hp"), mana: number("mana"), dr: number("dr"), mr: number("mr"),
    cr: number("cr"), fr: number("fr"), pr: number("pr"), haste: number("haste"),
    magic: number("magic"), nodrop: number("nodrop"),
  };
}
