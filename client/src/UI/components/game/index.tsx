import React from 'react';
import { Box } from '@mui/material';
import { inEditor } from '../../util/constants';
import { DevWindowComponent } from './dev/dev-window';
import { StoneUIBase } from './stone';
import { CompassWindowComponent } from './topbar/compass-window';
import 'allotment/dist/style.css';

export const GameUIComponent: React.FC = () => {
  return (
    <Box sx={{ height: '100vh', width: '100vw' }}>    
      <StoneUIBase />
      <CompassWindowComponent />
      {!inEditor && <DevWindowComponent />}
    </Box>
  );
};
