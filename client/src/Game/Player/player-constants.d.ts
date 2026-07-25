import { ItemInstance } from '@game/Net/messages';
export type NullableItemInstance = ItemInstance | null;
export declare enum InventorySlot {
    Charm = 0,
    Ear1 = 1,
    Head = 2,
    Face = 3,
    Ear2 = 4,
    Neck = 5,
    Shoulders = 6,
    Arms = 7,
    Back = 8,
    Wrist1 = 9,
    Wrist2 = 10,
    Range = 11,
    Hands = 12,
    Primary = 13,
    Secondary = 14,
    Finger1 = 15,
    Finger2 = 16,
    Chest = 17,
    Legs = 18,
    Feet = 19,
    Waist = 20,
    Ammo = 21,
    General1 = 22,
    General2 = 23,
    General3 = 24,
    General4 = 25,
    General5 = 26,
    General6 = 27,
    General7 = 28,
    General8 = 29,
    Cursor = 30
}
export declare const InventorySlotTextures: Record<string, InventorySlot>;
export declare const TextureProfileMap: Record<string, string>;
export declare const InventorySlotNames: {
    readonly 0: 'Charm';
    readonly 1: 'Ear';
    readonly 2: 'Head';
    readonly 3: 'Face';
    readonly 4: 'Ear';
    readonly 5: 'Neck';
    readonly 6: 'Shoulders';
    readonly 7: 'Arms';
    readonly 8: 'Back';
    readonly 9: 'Wrist';
    readonly 10: 'Wrist';
    readonly 11: 'Range';
    readonly 12: 'Hands';
    readonly 13: 'Primary';
    readonly 14: 'Secondary';
    readonly 15: 'Finger';
    readonly 16: 'Finger';
    readonly 17: 'Chest';
    readonly 18: 'Legs';
    readonly 19: 'Feet';
    readonly 20: 'Waist';
    readonly 21: 'Ammo';
};
export declare const getSlotNamesFromBitmask: (bitmask: number) => string;
