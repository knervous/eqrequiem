import { useMemo, useState } from 'react';
import { CommandHandler } from '@game/ChatCommands/command-handler';
import { useEventState } from '@game/Events/event-hooks';
import { Box, Stack, Typography } from '@mui/material';
import { UiImageComponent } from '@ui/common/ui-image';
import { ActionButton } from '../../action-button/action-button';
import { ActionButtonType, UIActions } from '../../action-button/constants';
import { StoneActionsAbilities } from './stone-actions-abilities';
import { StoneActionsCombat } from './stone-actions-combat';
import { StoneActionsSocials } from './stone-actions-socials';

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
            alignItems={'center'}
            direction={'column'}
            justifyContent={'center'}
            spacing={2}
            sx={{}}
          >
            <ActionButton
              useDefaultSize
              action={CommandHandler.instance().commandWho}
              actionData={UIActions[ActionButtonType.WHO]}
              buttonName="A_BTN_WHO"
              scale={scale}
            />
            <ActionButton
              useDefaultSize
              action={CommandHandler.instance().commandInvite}
              actionData={UIActions[ActionButtonType.INVITE]}
              buttonName="A_BTN_INVITE"
              scale={scale}
            />
            <ActionButton
              useDefaultSize
              action={CommandHandler.instance().commandDisband}
              actionData={UIActions[ActionButtonType.DISBAND]}
              buttonName="A_BTN_DISBAND"
              scale={scale}
            />
            <ActionButton
              useDefaultSize
              action={CommandHandler.instance().commandCamp}
              actionData={UIActions[ActionButtonType.CAMP]}
              buttonName="A_BTN_CAMP"
              scale={scale}
            />
            <ActionButton
              useDefaultSize
              action={CommandHandler.instance().commandSit}
              actionData={UIActions[ActionButtonType.SIT]}
              buttonName={sitting ? 'A_BTN_STAND' : 'A_BTN_SIT'}
              scale={scale}
            />

            <ActionButton
              useDefaultSize
              action={CommandHandler.instance().commandWalk}
              actionData={UIActions[ActionButtonType.WALK]}
              buttonName={running ? 'A_BTN_WALK' : 'A_BTN_RUN'}
              scale={scale}
            />

          </Stack>
        );
      case ActionTabs.Combat:
        return <StoneActionsCombat scale={scale} />;
      case ActionTabs.Socials:
        return <StoneActionsSocials scale={scale} />;
      case ActionTabs.Abilities:
        return <StoneActionsAbilities scale={scale} />;
      default:
        return <Box sx={{ p: 2 }}>Unknown Tab</Box>;
    }
  }, [mode, running, scale, sitting]);

  const text = useMemo(() => {
    let text = '';
    switch (mode) {
      case ActionTabs.Main:
        text = 'Main';
        break;
      case ActionTabs.Combat:
        text = 'Combat';
        break;
      case ActionTabs.Socials:
        text = 'Social';
        break;
      case ActionTabs.Abilities:
        text = 'Abilities';
        break;
      default:
        text = 'Unknown Tab';
    }
    return text;
  }, [mode]);
  return (
    <Box sx={{ height: '100%', pt: 5 }}>
      <Typography sx={{ textAlign: 'center', mt: 1, mb: 5, fontSize: 30, color: '#ddd' }}>{text}</Typography>
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
          crop
          name={
            mode === ActionTabs.Main ? 'A_MainTabActiveIcon' : 'A_MainTabIcon'
          }
          sx={tabStyles}
          onClick={() => setMode(ActionTabs.Main)}
        />
        <UiImageComponent
          crop
          name={
            mode === ActionTabs.Combat
              ? 'A_CombatTabActiveIcon'
              : 'A_CombatTabIcon'
          }
          sx={tabStyles}
          onClick={() => setMode(ActionTabs.Combat)}
        />
        <UiImageComponent
          crop
          name={
            mode === ActionTabs.Socials
              ? 'A_SocialsTabActiveIcon'
              : 'A_SocialsTabIcon'
          }
          sx={tabStyles}
          onClick={() => setMode(ActionTabs.Socials)}
        />
        <UiImageComponent
          crop
          name={
            mode === ActionTabs.Abilities
              ? 'A_AbilitiesTabActiveIcon'
              : 'A_AbilitiesTabIcon'
          }
          sx={tabStyles}
          onClick={() => setMode(ActionTabs.Abilities)}
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
