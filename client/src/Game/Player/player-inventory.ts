import emitter from '@game/Events/events';
import type { MoveItem } from '@game/Net/internal/api/capnp/common';
import type Player from './player';
import { InventorySlot, NullableItemInstance } from './player-constants';


export class PlayerInventory {
  public inventorySlots: Map<InventorySlot, NullableItemInstance>;

  constructor(private player: Player) {
    this.inventorySlots = new Map<InventorySlot, NullableItemInstance>();
    for (let i = 0; i < Object.keys(InventorySlot).length / 2; i++) {
      this.inventorySlots.set(i as InventorySlot, null);
    }
  }

  public get(slot: InventorySlot): NullableItemInstance {
    return this.inventorySlots.get(slot) || null;
  }

  public getHeadSlot(): NullableItemInstance {
    return this.get(InventorySlot.Head);
  }

  public set(slot: InventorySlot, item: NullableItemInstance): void {
    this.inventorySlots.set(slot, item);
  }

  public load() : void {
    for (const item of this.player.player?.inventoryItems ?? []) {
      this.set(item.slot as InventorySlot, item);     
    }
    emitter.emit('updateInventory');
  }


  public useItem(slot: InventorySlot): void {
    const item = this.get(slot);
    if (item) {
      console.log('Using item:', item);
      // this.player.useItem(item);
    } else {
      console.warn(`No item found in slot ${slot}`);
    }
  }

  public moveItem(item: MoveItem): void {
    const sourceSlot = item.fromSlot as InventorySlot;
    const targetSlot = item.toSlot as InventorySlot;

    const sourceItem = this.get(sourceSlot);
    const targetItem = this.get(targetSlot);

    this.set(targetSlot, sourceItem);
    this.set(sourceSlot, targetItem);
    emitter.emit('updateInventorySlot', sourceSlot);
    emitter.emit('updateInventorySlot', targetSlot);
  }
}
