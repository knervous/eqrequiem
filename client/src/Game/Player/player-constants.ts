import { ItemInstance } from '@game/Net/internal/api/capnp/item';

export type NullableItemInstance = ItemInstance | null;

export enum InventorySlot {
    Charm,
    Ear1,
    Head,
    Face,
    Ear2,
    Neck,
    Shoulders,
    Arms,
    Back,
    Wrist1,
    Wrist2,
    Range,
    Hands,
    Primary,
    Secondary,
    Finger1,
    Finger2,
    Chest,
    Legs,
    Feet,
    Waist,
    Ammo,
    General1,
    General2,
    General3,
    General4,
    General5,
    General6,
    General7,
    General8,
    Cursor
  }

export const InventorySlotTextures = {
  'he': InventorySlot.Head,
  'ch': InventorySlot.Chest,
  'ua': InventorySlot.Arms,
  'fa': InventorySlot.Wrist1,
  'lg': InventorySlot.Legs,
  'hn': InventorySlot.Hands,
  'ft': InventorySlot.Feet,
} as Record<string, InventorySlot>;

export const TextureProfileMap = {
  'he': 'head',
  'ch': 'chest',
  'ua': 'arms',
  'fa': 'wrist',
  'lg': 'legs',
  'hn': 'hands',
  'ft': 'feet',
} as Record<string, string>;


export const InventorySlotNames = {
  [InventorySlot.Charm]    : 'Charm',
  [InventorySlot.Ear1]     : 'Ear',
  [InventorySlot.Head]     : 'Head',
  [InventorySlot.Face]     : 'Face',
  [InventorySlot.Ear2]     : 'Ear',
  [InventorySlot.Neck]     : 'Neck',
  [InventorySlot.Shoulders]: 'Shoulders',
  [InventorySlot.Arms]     : 'Arms',
  [InventorySlot.Back]     : 'Back',
  [InventorySlot.Wrist1]   : 'Wrist',
  [InventorySlot.Wrist2]   : 'Wrist',
  [InventorySlot.Range]    : 'Range',
  [InventorySlot.Hands]    : 'Hands',
  [InventorySlot.Primary]  : 'Primary',
  [InventorySlot.Secondary]: 'Secondary',
  [InventorySlot.Finger1]  : 'Finger',
  [InventorySlot.Finger2]  : 'Finger',
  [InventorySlot.Chest]    : 'Chest',
  [InventorySlot.Legs]     : 'Legs',
  [InventorySlot.Feet]     : 'Feet',
  [InventorySlot.Waist]    : 'Waist',
  [InventorySlot.Ammo]     : 'Ammo',
} as const;

export const getSlotNamesFromBitmask = (bitmask: number): string => {
  return Array.from(new Set(Object.entries(InventorySlotNames)
    .filter(([slot, _]) => (bitmask & (1 << +slot)) !== 0)
    .map(([, name]) => name))).join(' ');
};   
