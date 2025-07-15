import React from 'react';
import { Box } from '@mui/material';
import { inEditor } from '../../util/constants';
import { ItemCursor } from './action-button/item-cursor';
import { DevWindowComponent } from './dev/dev-window';
import { StoneUIBase } from './stone';
import { CompassWindowComponent } from './topbar/compass-window';
import 'allotment/dist/style.css';

export const GameUIComponent: React.FC = () => {

  return (
    <Box id="ui-base" sx={{ height: '100vh', width: '100vw' }}>
      <StoneUIBase />
      <ItemCursor />
      <CompassWindowComponent />
      {!inEditor && <DevWindowComponent />}
    </Box>
  );
};
