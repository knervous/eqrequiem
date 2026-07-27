import React, { useCallback, useMemo, useRef } from 'react';
import { useInventorySlot } from '@game/Events/event-hooks';
import GameManager from '@game/Manager/game-manager';
import { MoveItem } from '@game/Net/messages';
import { OpCodes } from '@game/Net/opcodes';
import Player from '@game/Player/player';
import { InventorySlot, InventorySlotNames } from '@game/Player/player-constants';
import { Box } from '@mui/material';
import { WorldSocket } from '@ui/net/instances';
import { linkItemToChat } from '../chat/command-link-util';
import { FullItemEntryData } from './constants';
import { useItemDragClone } from './hooks';
import { ItemTooltip } from './item-tooltip';
import { ItemVisual } from './item-visual';

interface ItemButtonProps {
  scale: number;
  slot: InventorySlot;
  /** Omit for worn/carried top-level slots; pass a number for cursor/bag contents. */
  bagSlot?: number;
  hotButton?: boolean;
  hotButtonIndex?: number;
  height?: number | string | undefined;
  width?: number | string | undefined;
  insideBag?: boolean;
}

export const ItemButton: React.FC<ItemButtonProps> = (props) => {
  const item = useInventorySlot(props.slot, props.bagSlot);
  const actualBagSlot = item?.bagSlot ?? props.bagSlot ?? -1;
  const isBag = useMemo(() => (item?.bagslots ?? 0) > 0, [item]);
  const rightClickTimeout = useRef<NodeJS.Timeout | null>(null);
  const rightClickTimeoutFinished = useRef<boolean>(false);
  const itemActionData = useMemo((): FullItemEntryData | null => {
    return {
      slot          : props.slot,
      hotButton     : props.hotButton ?? false,
      hotButtonIndex: props.hotButtonIndex ?? -1,
    };
  }, [props]);

  const { elementRef, onMouseDown } =
    useItemDragClone<HTMLDivElement>(itemActionData);
  const onClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
      if (e.button === 0) {
        const hasCursorItem = Player.instance?.hasCursorItem;
        if (!hasCursorItem && !item) {
          return;
        }
       
        if (GameManager.instance?.modifierKeys.ctrl) {
          linkItemToChat(item!);
          return;
        }

        if (isBag) {
          Player.instance?.playerInventory.closeBag(props.slot);
        }
        console.log({
          toSlot: Player.instance?.hasCursorItem
            ? props.slot
            : InventorySlot.Cursor,
          fromSlot: Player.instance?.hasCursorItem
            ? InventorySlot.Cursor
            : props.slot,
          numberInStack: item?.stackable ? item.quantity : 1,
          fromBagSlot  : Player.instance?.hasCursorItem
            ? 0
            : actualBagSlot,
          toBagSlot: Player.instance?.hasCursorItem ? actualBagSlot : 0,
        });
        WorldSocket.sendMessage(OpCodes.MoveItem, MoveItem, {
          toSlot: Player.instance?.hasCursorItem
            ? props.slot
            : InventorySlot.Cursor,
          fromSlot: Player.instance?.hasCursorItem
            ? InventorySlot.Cursor
            : props.slot,
          numberInStack: item?.stackable ? item.quantity : 1,
          fromBagSlot  : Player.instance?.hasCursorItem
            ? 0
            : actualBagSlot,
          toBagSlot: Player.instance?.hasCursorItem ? actualBagSlot : 0,
        });
      }
    },
    [props.slot, item, isBag, actualBagSlot],
  );

  const onRightClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
      if (e.button !== 2) {
        onClick(e);
        return;
      } // Only handle right click
      // Right click
      e.preventDefault();
      if (item) {
        Player.instance?.playerInventory?.useItem(props.slot, actualBagSlot);
        // Handle right click action here, e.g., show context menu
        rightClickTimeout.current = setTimeout(() => {
          // Inspect item
          rightClickTimeoutFinished.current = true;
        }, 500);
      }
    },
    [item, props.slot, actualBagSlot, onClick],
  );

  const onMouseUp = useCallback(
    (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
      clearTimeout(rightClickTimeout.current ?? -1);
      if (rightClickTimeoutFinished.current) {
        rightClickTimeoutFinished.current = false;
      } else {
        if (e.button === 2) {
          // Action for item
        }
      }
    },
    [],
  );

  return (
    <>
      <Box
        ref={elementRef}
        className={`item-button-container rq-item-slot${props.insideBag ? ' rq-item-slot--bag' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={item?.name ?? `Empty ${InventorySlotNames[props.slot] ?? 'inventory'} slot`}
        sx={{
          width : props.width ?? '100%',
          height: props.height ?? '100%',
        }}
        onClick={onClick}
        onContextMenu={onRightClick}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            elementRef.current?.click();
          }
        }}
      >
        {item ? (
          <ItemTooltip item={item}>
            <Box
              className="item-button"
              sx={{
                width   : '100%',
                height  : '100%',
                position: 'relative',
              }}
            >
              <ItemVisual isContainer={isBag} item={item} />
              {item?.stackable ? (
                <Box
                  className="item-quantity"
                  sx={{
                    position    : 'absolute',
                    right       : 2,
                    bottom      : 1,
                    textAlign   : 'center',
                    minWidth    : 14,
                    background  : 'rgba(0, 0, 0, 0.72)',
                    px          : '2px',
                    color       : 'white',
                    fontSize    : Math.max(8, 10 / props.scale),
                  }}
                >
                  {item.quantity}
                </Box>
              ) : null}
            </Box>
          </ItemTooltip>
        ) : null}
      </Box>
    </>
  );
};
