import React, { lazy, Suspense } from 'react';
import { Box } from '@mui/material';
import { inEditor } from '../../util/constants';
import { ItemCursor } from './action-button/item-cursor';
import { ReliquaryHUD } from './reliquary';
import { useUIContext } from '../context';

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
      <ReliquaryHUD />
      <ItemCursor />
      {!inEditor && devWindowVisible ? (
        <Suspense fallback={null}>
          <DevWindowComponent />
        </Suspense>
      ) : null}
    </Box>
  );
};
