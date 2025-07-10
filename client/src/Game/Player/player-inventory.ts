import emitter from '@game/Events/events';
import { ItemInstance } from '@game/Net/internal/api/capnp/item';
import type Player from './player';
import { InventorySlot } from './player-constants';

type NullableItemInstance = ItemInstance | null;

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
}
