import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useEventArgState,
} from '@game/Events/event-hooks';
import emitter from '@game/Events/events';
import Player from '@game/Player/player';
import { Box, Grid } from '@mui/material';
import { UiTitleComponent } from '@ui/common/ui-title';
import { useDrag } from '@ui/hooks/use-drag';
import { createPortal } from 'react-dom';
import { useDebouncedCallback } from 'use-debounce';
import { ItemButton } from '../action-button/item-button';

export const Bag: React.FC<{
  slot: number;
  slots: number;
  scale: number;
  name?: string;
  initialX?: number;
  initialY?: number;
}> = ({ slot, slots, scale, name = 'Bag', initialX = 200, initialY = 400 }) => {
  const {
    x,
    y,
    handleMouseDown: handleDragMouseDown,

  } = useDrag(initialX, initialY);
  const bagState = useEventArgState('updateBagState', (e) => e.slot === slot, {
    slot,
    state: Player.instance!.playerInventory.getBagState(slot)!,
  })!;

  const debouncedXYStoreCallback = useDebouncedCallback(() => {
    console.log('Saving bag position', x, y);
    bagState.state.x = x;
    bagState.state.y = y;
  }, 250);
  useEffect(debouncedXYStoreCallback, [x, y, debouncedXYStoreCallback]);

  const { columns, rows } = useMemo(() => {
    return {
      columns: 2,
      rows   : slots / 2,
    };
  }, [slots]);

  const onContainerClick = useCallback(
    (_e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
      emitter.emit('bagClick', slot);
    },
    [slot],
  );
  return <Box
    id={`bag-${slot}`}
    sx={{
      position   : 'fixed',
      top        : y,
      left       : x,
      zIndex     : 100,
      width      : columns * 50,
      height     : rows * 50,
      scale,
      borderWidth: 2,
      borderStyle: 'solid',
      borderColor:
          ' rgb(180, 173, 134) rgb(142, 134, 107) rgb(61, 58, 48) rgb(177, 170, 142)',
    }}
    onClick={onContainerClick}
  >
    <UiTitleComponent
      draggable
      handleDragMouseDown={handleDragMouseDown}
      marginTop={-2}
      name={name}
    />
    <Grid container columns={16} sx={{ height: '100%' }}>
      {Array.from({ length: slots }).map((_, idx) => {
        return (
          <Grid key={`${idx}`} size={8} sx={{ height: 'calc(100% / 4)' }}>
            <ItemButton
              key={`${slot}-${idx}`}
              insideBag
              bagSlot={idx + 1}
              height={50}
              scale={scale}
              slot={slot}
              width={50}
            />
          </Grid>
        );
      })}
    </Grid>
  </Box>;
};
