import React, { lazy, Suspense } from 'react';
import { Box } from '@mui/material';
import { inEditor } from '../../util/constants';
import { ItemCursor } from './action-button/item-cursor';
import { StoneUIBase } from './stone';
import { CompassWindowComponent } from './topbar/compass-window';
import { useUIContext } from '../context';
import 'allotment/dist/style.css';

const DevWindowComponent = lazy(() =>
  import('./dev/dev-window').then((module) => ({
    default: module.DevWindowComponent,
  })),
);

export const GameUIComponent: React.FC = () => {
  const devWindowVisible = useUIContext(
    (state) => Boolean(state.ui.devWindow.visible),
  );

  return (
    <Box id="ui-base" sx={{ height: '100vh', width: '100vw' }}>
      <StoneUIBase />
      <ItemCursor />
      <CompassWindowComponent />
      {!inEditor && devWindowVisible ? (
        <Suspense fallback={null}>
          <DevWindowComponent />
        </Suspense>
      ) : null}
    </Box>
  );
};
