import React from 'react';
import { Box } from '@mui/material';

import { MainProvider, useMainContext } from '../components/context';

import BabylonWrapper from './babylon';
import { SplashScreen } from './splash';

const GameContainerComponent: React.FC = () => {
  const { ready, splash } = useMainContext();
  return (
    <Box      sx={{
      minHeight     : '100vh',
      background    : '#070909 url("/eltania/elrador-hero-v2.webp") 64% center / cover no-repeat',
    }}>
      {(splash || !ready) && <SplashScreen />}
      {ready ? <BabylonWrapper splash={splash} /> : null}
    </Box>
  );
};

export const GameContainer = () => {
  return  <MainProvider>
    <GameContainerComponent />
  </MainProvider>;
};

export default GameContainer;
