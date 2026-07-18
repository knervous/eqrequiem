/** Stable appearance ABI shared by Requiem and Libra developer tooling. */
export const REQUIEM_APPEARANCE_SLOTS = [
  "body",
  "face",
  "hair",
  "chest",
  "legs",
  "hands",
  "feet",
  "headEquipment",
  "mainHand",
  "offHand",
  "back",
] as const;

export type RequiemAppearanceSlot =
  (typeof REQUIEM_APPEARANCE_SLOTS)[number];

export const REQUIEM_SKINNED_APPEARANCE_SLOTS = new Set<RequiemAppearanceSlot>([
  "body",
  "face",
  "hair",
  "chest",
  "legs",
  "hands",
  "feet",
  "headEquipment",
]);

export const REQUIEM_SOCKET_APPEARANCE_SLOTS = new Set<RequiemAppearanceSlot>([
  "mainHand",
  "offHand",
  "back",
]);
