/** Stable appearance ABI shared by Requiem and Libra developer tooling. */
export declare const REQUIEM_APPEARANCE_SLOTS: readonly ["body", "face", "hair", "chest", "legs", "hands", "feet", "headEquipment", "mainHand", "offHand", "back"];
export type RequiemAppearanceSlot = (typeof REQUIEM_APPEARANCE_SLOTS)[number];
export declare const REQUIEM_SKINNED_APPEARANCE_SLOTS: Set<"back" | "body" | "chest" | "face" | "feet" | "hair" | "hands" | "headEquipment" | "legs" | "mainHand" | "offHand">;
export declare const REQUIEM_SOCKET_APPEARANCE_SLOTS: Set<"back" | "body" | "chest" | "face" | "feet" | "hair" | "hands" | "headEquipment" | "legs" | "mainHand" | "offHand">;
