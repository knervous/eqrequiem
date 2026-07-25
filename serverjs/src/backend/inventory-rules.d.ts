export interface InventoryPosition {
    slot: number;
    bag: number;
}
export interface InventoryRecord extends InventoryPosition {
    itemKey: string | number;
    containerSlots?: number;
}
export interface PlannedInventoryMove extends InventoryPosition {
    itemKey: string | number;
    fromSlot: number;
    fromBag: number;
}
export declare function planInventorySwap(inventory: readonly InventoryRecord[], from: InventoryPosition, to: InventoryPosition): PlannedInventoryMove[];
export declare function movementConfirmations(moves: readonly PlannedInventoryMove[], from: InventoryPosition, to: InventoryPosition): Array<{
    fromSlot: number;
    toSlot: number;
    fromBag: number;
    toBag: number;
}>;
