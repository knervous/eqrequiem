import React from 'react';
import { usePlayerInventory } from '@game/Events/event-hooks';
import { InventorySlot } from '@game/Player/player-constants';
import { Box } from '@mui/material';
import { inEditor } from '../../util/constants';
import { ItemCursor } from './action-button/item-cursor';
import { DevWindowComponent } from './dev/dev-window';
import { StoneUIBase } from './stone';
import { CompassWindowComponent } from './topbar/compass-window';
import 'allotment/dist/style.css';

export const GameUIComponent: React.FC = () => {

  return (
    <Box sx={{ height: '100vh', width: '100vw' }}>
      <StoneUIBase />
     
      <ItemCursor />

      <CompassWindowComponent />
      {!inEditor && <DevWindowComponent />}
    </Box>
  );
};
