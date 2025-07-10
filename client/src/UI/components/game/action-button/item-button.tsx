import { useMemo } from 'react';
import { ItemInstance } from '@game/Net/internal/api/capnp/item';
import { InventorySlot } from '@game/Player/player-constants';
import { Box } from '@mui/material';
import { useItemImage, useSakImage } from '@ui/hooks/use-image';
import { FullItemEntryData } from './constants';
import { useItemDragClone } from './hooks';

interface ItemButtonProps {
  scale: number;
  slot?: InventorySlot;
  item: ItemInstance | undefined | null;
  hotButton?: boolean;
  hotButtonIndex?: number;
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

export const ItemButton: React.FC<ItemButtonProps> = (props) => {
  const slot = useMemo(() => props.item?.slot ?? props.slot ?? -1, [props.item, props.slot]);
  const itemActionData = useMemo((): FullItemEntryData | null => {
    return {
      slot,
      hotButton     : props.hotButton ?? false,
      hotButtonIndex: props.hotButtonIndex ?? -1,
    };
  }, [props, slot]);

  const { elementRef, onMouseDown } = useItemDragClone<HTMLDivElement>(
    itemActionData,
  );
  const bgEntry = useSakImage(backgroundMap[slot], true);
  const itemEntry = useItemImage(props.item?.icon ?? -1);

  return (
    <Box
      ref={elementRef}
      className="item-button-container"
      sx={{
        ['&:hover']: {
          boxShadow: '0px 0px 10px 5px inset rgba(216, 215, 208, 0.27)',
        },
        backgroundImage: `url(${bgEntry.image})`,
        backgroundSize : 'cover',
        width          : '100%',
        height         : '100%',
      }}
      title={props.item?.name}
      onMouseDown={onMouseDown}
    >
      {props.item ? (
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
          {props.item?.stackable ? (
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
              {props.item.quantity}
            </Box>
          ) : null}

        </Box>

        
      ) : null}
    </Box>
  );
};
