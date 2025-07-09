import { useMemo, useState } from 'react';
import { CommandHandler } from '@game/ChatCommands/command-handler';
import { useEventState } from '@game/Events/event-hooks';
import { Box, Stack } from '@mui/material';
import { UiImageComponent } from '@ui/common/ui-image';
import { ActionButton } from '../../action-button/action-button';
import { ActionButtonType, UIActions } from '../../action-button/constants';
import { StoneActionsCombat } from './stone-actions-combat';

const ActionTabs = {
  Main     : 0,
  Combat   : 1,
  Socials  : 2,
  Abilities: 3,
} as const;

export const StoneActions: React.FC<{ scale: number }> = ({ scale }) => {
  const [mode, setMode] = useState<number>(ActionTabs.Main);
  const running = useEventState('playerRunning', true);
  const sitting = useEventState('playerSitting', false);
  const tabStyles = useMemo(
    () => ({
      '&:hover': {
        boxShadow   : '0px 0px 2px 2px rgba(255, 215, 0, 0.3)',
        borderRadius: '25%',
      },
      transform: 'scale(3)',
      ['*']    : {
        fontSize: '40px',
      },
    }),
    [],
  );
  const content = useMemo(() => {
    switch (mode) {
      case ActionTabs.Main:
        return (
          <Stack
            sx={{}}
            spacing={2}
            direction={'column'}
            justifyContent={'center'}
            alignItems={'center'}
          >
            <ActionButton
              action={CommandHandler.instance.commandWho}
              scale={scale}
              useDefaultSize
              actionData={UIActions[ActionButtonType.WHO]}
              buttonName="A_BTN_WHO"
            />
            <ActionButton
              action={CommandHandler.instance.commandInvite}
              scale={scale}
              useDefaultSize
              actionData={UIActions[ActionButtonType.INVITE]}
              buttonName="A_BTN_INVITE"
            />
            <ActionButton
              action={CommandHandler.instance.commandDisband}
              scale={scale}
              useDefaultSize
              actionData={UIActions[ActionButtonType.DISBAND]}
              buttonName="A_BTN_DISBAND"
            />
            <ActionButton
              action={CommandHandler.instance.commandCamp}
              scale={scale}
              useDefaultSize
              actionData={UIActions[ActionButtonType.CAMP]}
              buttonName="A_BTN_CAMP"
            />
            <ActionButton
              action={CommandHandler.instance.commandSit}
              scale={scale}
              useDefaultSize
              actionData={UIActions[ActionButtonType.SIT]}
              buttonName={sitting ? 'A_BTN_STAND' : 'A_BTN_SIT'}
            />

            <ActionButton
              action={CommandHandler.instance.commandWalk}
              scale={scale}
              useDefaultSize
              actionData={UIActions[ActionButtonType.WALK]}
              buttonName={running ? 'A_BTN_WALK' : 'A_BTN_RUN'}
            />

          </Stack>
        );
      case ActionTabs.Combat:
        return <StoneActionsCombat scale={scale} />;
      case ActionTabs.Socials:
        return <Box sx={{ p: 2 }}>Socials</Box>;
      case ActionTabs.Abilities:
        return <Box sx={{ p: 2 }}>Abilities</Box>;
      default:
        return <Box sx={{ p: 2 }}>Unknown Tab</Box>;
    }
  }, [mode, running, scale, sitting]);

  return (
    <Box sx={{ height: '100%', pt: 5 }}>
      <Stack
        direction={'row'}
        sx={{
          justifyContent: 'space-around',
          width         : '80%',
          alignItems    : 'center',
          m             : '15px auto',
          mb            : 6,
        }}
      >
        <UiImageComponent
          sx={tabStyles}
          crop
          onClick={() => setMode(ActionTabs.Main)}
          name={
            mode === ActionTabs.Main ? 'A_MainTabActiveIcon' : 'A_MainTabIcon'
          }
        />
        <UiImageComponent
          sx={tabStyles}
          crop
          onClick={() => setMode(ActionTabs.Combat)}
          name={
            mode === ActionTabs.Combat
              ? 'A_CombatTabActiveIcon'
              : 'A_CombatTabIcon'
          }
        />
        <UiImageComponent
          sx={tabStyles}
          crop
          onClick={() => setMode(ActionTabs.Socials)}
          name={
            mode === ActionTabs.Socials
              ? 'A_SocialsTabActiveIcon'
              : 'A_SocialsTabIcon'
          }
        />
        <UiImageComponent
          sx={tabStyles}
          crop
          onClick={() => setMode(ActionTabs.Abilities)}
          name={
            mode === ActionTabs.Abilities
              ? 'A_AbilitiesTabActiveIcon'
              : 'A_AbilitiesTabIcon'
          }
        />
      </Stack>
      <Box
        sx={{
          width : '100%',
          height: 300,
          mt    : 1,
          ['*'] : {
            fontSize: '40px',
          },
        }}
      >
        {content}
      </Box>
    </Box>
  );
};
