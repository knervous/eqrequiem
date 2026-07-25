import { type MoveItem } from '@game/Net/messages';
import type Player from './player';
import { InventorySlot, NullableItemInstance } from './player-constants';
export type BagState = {
    open: boolean;
    zIndex: number;
    x: number;
    y: number;
};
export declare class PlayerInventory {
    private player;
    private inventorySlots;
    private bagsOpen;
    constructor(player: Player);
    /** Build the internal map key from slot + bagSlot */
    private makeKey;
    /** Get an item in a given slot+bagslot (default to belt/backpack) */
    get(slot: InventorySlot, bagSlot?: number): NullableItemInstance;
    /** Convenience for head equip (always bagSlot = -1) */
    getHeadSlot(): NullableItemInstance;
    /** Place an item into slot+bagslot */
    set(slot: InventorySlot, item: NullableItemInstance, bagSlot?: number): void;
    delete(slot: InventorySlot, bagSlot?: number): void;
    /** Load from server; uses each item’s own bagSlot property */
    load(): void;
    /** Use an item in slot+bagslot (default general) */
    useItem(slot: InventorySlot, bagSlot?: number): void;
    getBagState(slot: InventorySlot): BagState;
    /** Toggle open/close for an equipment-bag slot (always bagSlot=0) */
    toggleBag(slot: InventorySlot): void;
    /** Toggle open/close for an equipment-bag slot (always bagSlot=0) */
    closeBag(slot: InventorySlot): void;
    isBagOpen(slot: InventorySlot): boolean;
    /** True if the item in general/belt layer has capacity > 0 */
    private isBagSlot;
    /**
     * Move an item from (fromSlot, fromBag) to (toSlot, toBag).
     * MoveItem on the wire now should include .fromBag and .toBag
     */
    moveItem(move: MoveItem): Promise<void>;
    destroyCursorItem(): void;
}
