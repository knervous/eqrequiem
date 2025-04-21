import React from 'react';
import { UiImageComponent } from './ui-image';
import { Box, Stack } from '@mui/material';


export const UiBarComponent: React.FC = () => { 

  return <Box>
    <Stack direction="row">
      <UiImageComponent name="A_GaugeEndCapLeft" />
      <UiImageComponent name="A_GaugeBackground" />
      <UiImageComponent name="A_GaugeEndCapRight" />
    </Stack>
  </Box>;
};