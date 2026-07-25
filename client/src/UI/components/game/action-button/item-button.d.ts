import React from 'react';
import { InventorySlot } from '@game/Player/player-constants';
interface ItemButtonProps {
    scale: number;
    slot: InventorySlot;
    bagSlot: number;
    hotButton?: boolean;
    hotButtonIndex?: number;
    height?: number | string | undefined;
    width?: number | string | undefined;
    insideBag?: boolean;
}
export declare const ItemButton: React.FC<ItemButtonProps>;
export {};
