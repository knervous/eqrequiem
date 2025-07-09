import { useState } from 'react';
import { useSocialButtons } from '@game/Config/use-config';
import Player from '@game/Player/player';
import { Grid, Stack, Typography } from '@mui/material';
import { UiButtonComponent } from '@ui/common/ui-button';
import { ActionButton } from '../../action-button/action-button';

const pageSize = 6;

export const StoneActionsSocials: React.FC<{
  scale: number;
}> = ({ scale }) => {
  const [page, setPage] = useState(0);
  const socialButtons = useSocialButtons();
  if (!Player.instance) {
    return null;
  }
  return (
    <>
      <Stack alignItems="center" direction="row" justifyContent="center" sx={{ m: 0, p: 0, mt: 5, mb: 5, width: '100%' }}>
        <UiButtonComponent
          buttonName="A_LeftArrowBtn"
          scale={1.5}
          onClick={() => setPage((prev) => Math.max(prev - 1, 0))}
        />
        <Typography
          sx={{
            width    : 40,
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
      <Grid
        container
        columns={16}
        sx={{
          width  : '100%',
          height : '350px',
          margin : '10px auto',
          padding: '0px 40px',
        }}
      >
        {Array.from({ length: pageSize }).map((_, idx) => (
          <Grid key={idx} size={8}>
            <ActionButton
              hotButton
              playerAction
              action={Player.instance!.doAction.bind(Player.instance)}
              actionData={socialButtons?.[idx + (page * pageSize)]}
              buttonName={'A_SquareBtn'}
              scale={scale}
              size={105}
            />
          </Grid>
        ))}
      </Grid>
    </>
  );
};
