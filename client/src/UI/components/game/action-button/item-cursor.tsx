import React, { useCallback, useEffect, useRef } from 'react';
import { useInventorySlot } from '@game/Events/event-hooks';
import { InventorySlot } from '@game/Player/player-constants';
import { Box } from '@mui/material';
import { useItemImage } from '@ui/hooks/use-image';

export const ItemCursor: React.FC = () => {
  const item = useInventorySlot(InventorySlot.Cursor);
  const itemEntry = useItemImage(item?.icon ?? -1);
  const elementRef = useRef<HTMLDivElement>(null);
  const mousePositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const updateMousePosition = useCallback((event: MouseEvent) => {
    mousePositionRef.current = { x: event.clientX, y: event.clientY };
    if (elementRef.current) {
      elementRef.current.style.left = `${mousePositionRef.current.x}px`;
      elementRef.current.style.top = `${mousePositionRef.current.y}px`;
    }
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', updateMousePosition);
    return () => {
      window.removeEventListener('mousemove', updateMousePosition);
    };
  }, [updateMousePosition]);

  return item ? <Box
    ref={elementRef}
    sx={{
      backgroundImage: `url(${itemEntry})`,
      backgroundSize : 'cover',
      width          : '40px',
      height         : '40px',
      position       : 'absolute',
      pointerEvents  : 'none',
      zIndex         : 1000,
      left           : mousePositionRef.current.x,
      top            : mousePositionRef.current.y,
    }}
  >
    {item?.stackable ? (
      <Box
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
          fontSize    : 10,
        }}
      >
        {item.quantity}
      </Box>
    ) : null}
  </Box> : null;

};
