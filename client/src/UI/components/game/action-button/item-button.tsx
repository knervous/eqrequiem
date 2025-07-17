import React, { useCallback, useMemo, useRef } from 'react';
import { useInventorySlot } from '@game/Events/event-hooks';
import { MoveItem } from '@game/Net/internal/api/capnp/common';
import { OpCodes } from '@game/Net/opcodes';
import Player from '@game/Player/player';
import { InventorySlot } from '@game/Player/player-constants';
import { Box } from '@mui/material';
import { useItemImage, useSakImage } from '@ui/hooks/use-image';
import { WorldSocket } from '@ui/net/instances';
import { FullItemEntryData } from './constants';
import { useItemDragClone } from './hooks';
import { ItemTooltip } from './item-tooltip';

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

const backgroundMap: Record<number, string> = {
  [InventorySlot.General1] : 'A_InvSlot1BG',
  [InventorySlot.General2] : 'A_InvSlot2BG',
  [InventorySlot.General3] : 'A_InvSlot3BG',
  [InventorySlot.General4] : 'A_InvSlot4BG',
  [InventorySlot.General5] : 'A_InvSlot5BG',
  [InventorySlot.General6] : 'A_InvSlot6BG',
  [InventorySlot.General7] : 'A_InvSlot7BG',
  [InventorySlot.General8] : 'A_InvSlot8BG',
  [InventorySlot.Ear1]     : 'A_InvEar1',
  [InventorySlot.Ear2]     : 'A_InvEar2',
  [InventorySlot.Neck]     : 'A_InvNeck',
  [InventorySlot.Head]     : 'A_InvHead',
  [InventorySlot.Face]     : 'A_InvFace',
  [InventorySlot.Chest]    : 'A_InvChest',
  [InventorySlot.Arms]     : 'A_InvArms',
  [InventorySlot.Wrist1]   : 'A_InvWrist1',
  [InventorySlot.Wrist2]   : 'A_InvWrist2',
  [InventorySlot.Hands]    : 'A_InvHands',
  [InventorySlot.Finger1]  : 'A_InvRing1',
  [InventorySlot.Finger2]  : 'A_InvRing2',
  [InventorySlot.Legs]     : 'A_InvLegs',
  [InventorySlot.Feet]     : 'A_InvFeet',
  [InventorySlot.Primary]  : 'A_InvPrimary',
  [InventorySlot.Secondary]: 'A_InvSecondary',
  [InventorySlot.Range]    : 'A_InvRange',
  [InventorySlot.Ammo]     : 'A_InvAmmo',
};

const emptyInventoryBg = 'Jib_RecessedBox';

export const ItemButton: React.FC<ItemButtonProps> = (props) => {
  const item = useInventorySlot(props.slot, props.bagSlot);
  const isBag = useMemo(() => item?.bagslots ?? 0 > 0, [item]);
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
  const bgEntry = useSakImage(
    props.insideBag ? emptyInventoryBg : backgroundMap[props.slot],
    true,
  );
  const itemEntry = useItemImage(item?.icon ?? -1);
  const onClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
      // Left click
      if (e.button === 0) {
        const hasCursorItem = Player.instance?.hasCursorItem;
        if (!hasCursorItem && !item) {
          // If no item and no cursor item, do nothing
          console.log(
            'Left click on empty item button',
            props.slot,
            props.bagSlot,
          );
          return;
        }
        console.log('Left click on item button', props.slot, props.bagSlot);
        console.log('Has cursor item:', Player.instance?.hasCursorItem);
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
            : (props?.bagSlot ?? 0),
          toBagSlot: Player.instance?.hasCursorItem ? props.bagSlot : 0,
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
            : (props?.bagSlot ?? 0),
          toBagSlot: Player.instance?.hasCursorItem ? props.bagSlot : 0,
        });
      }
    },
    [props.slot, props.bagSlot, item, isBag],
  );

  const onRightClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
      // Right click
      e.preventDefault();
      if (item) {
        Player.instance?.playerInventory?.useItem(props.slot);
        // Handle right click action here, e.g., show context menu
        rightClickTimeout.current = setTimeout(() => {
          // Inspect item
          rightClickTimeoutFinished.current = true;
        }, 500);
      }
    },
    [item, props.slot],
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
        className="item-button-container"
        sx={{
          ['&:hover']: {
            boxShadow: '0px 0px 10px 5px inset rgba(216, 215, 208, 0.27)',
          },
          backgroundImage: `url(${bgEntry.image})`,
          backgroundSize : 'cover',
          width          : props.width ?? '100%',
          height         : props.height ?? '100%',
        }}
        onClick={onClick}
        onContextMenu={onRightClick}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
      >
        {item ? (
          <ItemTooltip item={item}>
            <Box
              className="item-button"
              sx={{
                backgroundImage: `url(${itemEntry})`,
                backgroundSize : 'cover',
                width          : 'calc(80%)',
                height         : 'calc(80%)',
                position       : 'relative',
                left           : '10%',
                top            : '10%',
              }}
            >
              {item?.stackable ? (
                <Box
                  className="item-quantity"
                  sx={{
                    position    : 'relative',
                    left        : 'calc(80%)',
                    top         : 'calc(70%)',
                    textAlign   : 'center',
                    width       : '10%',
                    background  : 'rgba(0, 0, 0, 0.3)',
                    p           : '1px',
                    borderRadius: '4px',
                    color       : 'white',
                    fontSize    : 10 / props.scale,
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
