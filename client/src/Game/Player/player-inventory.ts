import { capnpToPlainObject } from '@game/Constants/util';
import emitter from '@game/Events/events';
import { type MoveItem } from '@game/Net/internal/api/capnp/common';
import { DeleteItem, ItemInstance } from '@game/Net/internal/api/capnp/item';
import { OpCodes } from '@game/Net/opcodes';
import { WorldSocket } from '@ui/net/instances';
import type Player from './player';
import { InventorySlot, NullableItemInstance } from './player-constants';

type InventoryKey = `${InventorySlot}:${number}`;
export type BagState = {
  open: boolean;
  zIndex: number;
  x: number;
  y: number;
};
export class PlayerInventory {
  private inventorySlots = new Map<InventoryKey, NullableItemInstance>();
  private bagsOpen = new Map<InventorySlot, BagState>();

  constructor(private player: Player) {
    for (let i = InventorySlot.General1; i <= InventorySlot.General8; i++) {
      this.bagsOpen.set(i, {
        open  : false,
        zIndex: 100 + i,
        x     : 200,
        y     : 300,
      } as BagState);
    }
  }

  /** Build the internal map key from slot + bagSlot */
  private makeKey(slot: InventorySlot, bagSlot: number): InventoryKey {
    return `${slot}:${bagSlot}`;
  }

  /** Get an item in a given slot+bagslot (default to belt/backpack) */
  public get(slot: InventorySlot, bagSlot = 0): NullableItemInstance {
    return this.inventorySlots.get(this.makeKey(slot, bagSlot)) || null;
  }

  /** Convenience for head equip (always bagSlot = -1) */
  public getHeadSlot(): NullableItemInstance {
    return this.get(InventorySlot.Head, -1);
  }

  /** Place an item into slot+bagslot */
  public set(
    slot: InventorySlot,
    item: NullableItemInstance,
    bagSlot = item?.bagSlot ?? 0,
  ): void {
    const key = this.makeKey(slot, bagSlot);
    this.inventorySlots.set(key, item);
  }

  public delete(slot: InventorySlot, bagSlot = 0): void {
    const key = this.makeKey(slot, bagSlot);
    this.inventorySlots.delete(key);
    emitter.emit('updateInventorySlot', { slot, bag: bagSlot });
  }

  /** Load from server; uses each item’s own bagSlot property */
  public load(): void {
    for (const item of this.player.player?.inventoryItems ?? []) {
      this.set(item.slot as InventorySlot, item, item.bagSlot);
    }
    emitter.emit('updateInventory');
  }

  /** Use an item in slot+bagslot (default general) */
  public useItem(slot: InventorySlot, bagSlot = 0): void {
    console.log('Use item', slot, bagSlot);
    const item = this.get(slot, bagSlot);
    if (!item) {
      // console.warn(`No item in ${slot}@${bagSlot}`);
      return;
    }

    // if it's a bag in the general/belt layer, toggle it
    if (this.isBagSlot(slot, bagSlot)) {
      this.toggleBag(slot);
    }
  }

  public getBagState(slot: InventorySlot): BagState {
    const bagState = this.bagsOpen.get(slot);
    if (!bagState) {
      this.bagsOpen.set(slot, {
        open  : false,
        zIndex: 100 + slot,
        x     : 200,
        y     : 300,
      } as BagState);
      return this.bagsOpen.get(slot)!;
    }
    return bagState;
  }

  /** Toggle open/close for an equipment-bag slot (always bagSlot=0) */
  public toggleBag(slot: InventorySlot): void {
    const open = !this.bagsOpen.get(slot)?.open;
    this.bagsOpen.get(slot)!.open = open;
    emitter.emit('updateBagState', { slot, state: this.bagsOpen.get(slot)! });
  }

  /** Toggle open/close for an equipment-bag slot (always bagSlot=0) */
  public closeBag(slot: InventorySlot): void {
    this.bagsOpen.get(slot)!.open = false;
    emitter.emit('updateBagState', { slot, state: this.bagsOpen.get(slot)! });
  }

  public isBagOpen(slot: InventorySlot): boolean {
    return this.bagsOpen.get(slot)?.open || false;
  }

  /** True if the item in general/belt layer has capacity > 0 */
  private isBagSlot(slot: InventorySlot, bagSlot = 0): boolean {
    const item = this.get(slot, bagSlot);
    return !!item && item.bagslots > 0;
  }

  private getBagChildren(slot: InventorySlot): ItemInstance[] {
    const children: ItemInstance[] = [];
    for (const [key, item] of this.inventorySlots.entries()) {
      const [itemSlot] = key.split(':').map(Number);
      if (item && itemSlot === slot && item.bagSlot > 0) {
        children.push(item);
      }
    }
    return children;
  }

  /**
   * Move an item from (fromSlot, fromBag) to (toSlot, toBag).
   * MoveItem on the wire now should include .fromBag and .toBag
   */
  public async moveItem(move: MoveItem): Promise<void> {
    const { fromSlot, fromBagSlot, toSlot, toBagSlot } = move;
    const srcKey = this.makeKey(fromSlot as InventorySlot, fromBagSlot);
    const dstKey = this.makeKey(toSlot as InventorySlot, toBagSlot);

    const srcItem = this.inventorySlots.get(srcKey) || null;
    const dstItem = this.inventorySlots.get(dstKey) || null;

    if (srcItem) {
      srcItem.bagSlot = fromBagSlot;
    }
    if (dstItem) {
      dstItem.bagSlot = toBagSlot;
    }

    this.inventorySlots.set(dstKey, srcItem);
    this.inventorySlots.set(srcKey, dstItem);

    emitter.emit('updateInventorySlot', { slot: fromSlot, bag: fromBagSlot });
    emitter.emit('updateInventorySlot', { slot: toSlot, bag: toBagSlot });
    if (fromSlot <= InventorySlot.Ammo || toSlot <= InventorySlot.Ammo) {
      this.player.playerEntity?.updateModelTextures();

    }
  }

  destroyCursorItem(): void {
    WorldSocket.sendMessage(OpCodes.DeleteItem, DeleteItem, {
      slot: InventorySlot.Cursor,
      bag : 0,
    });
  }
}
