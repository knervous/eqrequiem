import { useState } from 'react';
import { useActionButtons } from '@game/Config/use-config';
import { Box, Grid, Stack, Typography } from '@mui/material';
import { UiButtonComponent } from '@ui/common/ui-button';
import { useSakImage } from '@ui/hooks/use-image';
import { ActionHotButton } from '../../action-button/action-button';
 
const itemsPerPage = 10;

export const StoneHotButtons: React.FC<{ scale: number}> = ({ scale }) => {
  const hbImage = useSakImage('HBW_BG_TXDN', true);
  const [page, setPage] = useState(0);
  const actionButtons = useActionButtons();

  return (
    <Box
      sx={{
        width          : hbImage.entry.width * 2,
        height         : hbImage.entry.height * 2,
        backgroundImage: `url(${hbImage.image})`,
        backgroundSize : 'cover',
      }}
    >
      <Stack alignItems="center" direction="row" justifyContent="center">
        <UiButtonComponent
          buttonName="A_LeftArrowBtn"
          scale={1.5}
          onClick={() => setPage((prev) => Math.max(prev - 1, 0))}
        />
        <Typography
          sx={{
            width    : 30,
            textAlign: 'center',
            fontSize : 35,
            color    : 'white',
            mx       : 3,
          }}
        >
          {page + 1}
        </Typography>
        <UiButtonComponent
          buttonName="A_RightArrowBtn"
          scale={1.5}
          onClick={() => setPage((prev) => Math.min(prev + 1, 9))}
        />
      </Stack>
      <Box
        sx={{
          width   : 250,
          height  : 640,
          position: 'relative',
          top     : 7,
          left    : 26,
        }}
      >
        <Grid container columns={16}>
          {Array.from({ length: itemsPerPage }).map((_, idx) => (
            <Grid key={idx} size={8} sx={{ height: 640 / 5, width: 125 }}>
              <ActionHotButton
                hotButton
                actionButtonConfig={actionButtons}
                actionData={actionButtons?.hotButtons?.[idx + (page * itemsPerPage)]}
                index={idx + (page * itemsPerPage)}
                scale={scale}
                size={125}
              />
            </Grid>
          ))}
        </Grid>
      </Box>
    </Box>
  );
};
