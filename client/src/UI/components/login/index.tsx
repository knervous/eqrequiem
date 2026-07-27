import React from 'react';
import { Box } from '@mui/material';
import { LoginWindowComponent } from './login-window';

export const LoginUIComponent: React.FC = () => {
  return (
    <Box
      sx={{
        background: `
          linear-gradient(90deg, rgba(3, 7, 8, 0.74), rgba(3, 7, 8, 0.18)),
          radial-gradient(circle at center, rgba(0, 0, 0, 0) 22%, rgba(0, 0, 0, 0.84) 100%),
          url("/eltania/elrador-hero-v2.webp") 64% center / cover no-repeat
        `,
        backgroundColor: '#070909',
        width          : '100vw',
        height         : '100vh',
        minHeight      : 0,
        padding        : '24px',
        overflow       : 'auto',
        display        : 'flex',
        justifyContent : 'center',
        alignItems     : 'center',
      }}
    >
      <LoginWindowComponent />
    </Box>
  );
};
