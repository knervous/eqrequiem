import { useEffect, useMemo, useRef, useState } from 'react';
import { CommandHandler } from '@game/ChatCommands/command-handler';
import { UserConfig } from '@game/Config/config';
import type { ActionButtonsConfig } from '@game/Config/types';
import emitter from '@game/Events/events';
import Player from '@game/Player/player';
import { Box } from '@mui/material';
import { UiButtonComponent } from '@ui/common/ui-button';
import { ActionButtonData, ActionButtonType } from './constants';
import { useImmediateDragClone } from './hooks';

export type FullActionData = ActionButtonData & {
  hotButton?: boolean;
  hotButtonIndex?: number;
};

interface CommonButtonProps {
  background?: string;
  foreGround?: string;
  size?: number | string;
  text?: string;
  scale?: number;
  actionData?: FullActionData;
  useDefaultSize?: boolean;
  hotButton?: boolean;
}

interface HotButtonProps extends CommonButtonProps {
  index: number;
  actionButtonConfig: ActionButtonsConfig | null;
}

interface ActionButtonProps extends CommonButtonProps {
  action: (_: any) => void;
  buttonName?: string;
}

export const ActionButton: React.FC<ActionButtonProps> = (props) => {
  const { elementRef, onMouseDown } = useImmediateDragClone<HTMLDivElement>(
    props.scale ?? 1,
    props.actionData,
  );
  const uiButton = useMemo(() => {
    if (!props.buttonName) {
      return null;
    }
    return (
      <UiButtonComponent
        text={props.text}
        buttonName={props.buttonName}
        textSx={{
          fontSize: '25px',
          font    : 'Arial',
          color   : 'black',
        }}
        sx={{
          ['&:hover']: {
            boxShadow: '0px 0px 10px 5px inset rgba(216, 215, 208, 0.27)',
          },
          ...(props.useDefaultSize
            ? {}
            : { width: props.size, height: props.size }),
        }}
      ></UiButtonComponent>
    );
  }, [props.buttonName, props.text, props.size, props.useDefaultSize]);

  return (
    <Box
      ref={elementRef}
      onMouseDown={onMouseDown}
      className="action-button"
      sx={{
        ['&:hover']: {
          boxShadow: '0px 0px 10px 5px inset rgba(216, 215, 208, 0.27)',
        },
        ...(props.useDefaultSize
          ? {}
          : {
            width : props.size,
            height: props.size,
          }),

        display       : 'flex',
        alignItems    : 'center',
        justifyContent: 'center',
      }}
      onClick={props.action}
    >
      {uiButton}
    </Box>
  );
};

export const ActionHotButton: React.FC<HotButtonProps> = (props) => {
  const dropRef = useRef<HTMLDivElement>(null);

  const action = useMemo(() => {
    const player = Player.instance;
    if (!player) {
      return () => console.log('No player instance');
    }
    switch (props.actionData?.type) {
      case ActionButtonType.WHO:
        return CommandHandler.instance.commandWho.bind(CommandHandler.instance);
      case ActionButtonType.INVITE:
        return CommandHandler.instance.commandInvite.bind(
          CommandHandler.instance,
        );
      case ActionButtonType.DISBAND:
        return CommandHandler.instance.commandDisband.bind(
          CommandHandler.instance,
        );
      case ActionButtonType.CAMP:
        return CommandHandler.instance.commandCamp.bind(
          CommandHandler.instance,
        );
      case ActionButtonType.HELP:
        return CommandHandler.instance.commandHelp.bind(
          CommandHandler.instance,
        );
      case ActionButtonType.PERSONA:
        return CommandHandler.instance.commandPersona.bind(
          CommandHandler.instance,
        );
      case ActionButtonType.OPTIONS:
        return CommandHandler.instance.commandOptions.bind(
          CommandHandler.instance,
        );
      case ActionButtonType.MELEE_ATTACK:
        return player.autoAttack.bind(player);
      case ActionButtonType.RANGED_ATTACK:
        return player.rangedAttack.bind(player);
      case ActionButtonType.SIT:
        return player.toggleSit.bind(player);
      case ActionButtonType.WALK:
        return player.toggleWalk.bind(player);
      case ActionButtonType.SOCIALS:
        return () => {
          console.log('Socials action triggered');
          // this will need some work
          for (const line of props.actionButtonConfig?.socialButtons?.[
            props.actionData?.index ?? 0
          ]?.data ?? ([] as string[])) {
            console.log('Executing social command:', line);
            CommandHandler.instance.parseCommand(line.slice(1));
          }
        };
      case ActionButtonType.COMBAT:
        return () =>
          player.doAction(
            props.actionButtonConfig?.combatButtons?.[
              props.actionData?.index ?? 0
            ] as ActionButtonData,
          );
      default:
        return () => console.log('Default action triggered');
    }
  }, [props.actionData, props.actionButtonConfig]);

  const buttonName = useMemo(
    () =>
      props.actionData !== undefined &&
      (
        [
          ActionButtonType.COMBAT,
          ActionButtonType.SOCIALS,
          ActionButtonType.ABILITIES,
          ActionButtonType.OPTIONS,
          ActionButtonType.HELP,
          ActionButtonType.PERSONA,
          ActionButtonType.WHO,
          ActionButtonType.INVITE,
          ActionButtonType.DISBAND,
          ActionButtonType.CAMP,
          ActionButtonType.SIT,
          ActionButtonType.WALK,
          ActionButtonType.MELEE_ATTACK,
          ActionButtonType.RANGED_ATTACK,
        ] as ActionButtonType[]
      ).includes(props.actionData!.type!)
        ? 'A_SquareBtn'
        : '',

    [props.actionData],
  );

  const [forceRender, setForceRender] = useState(0);

  // Listen for player changes
  useEffect(() => {
    const cb = () => {
      setForceRender((prev) => prev + 1);
    };
    emitter.on('updateHotButtons', cb);
    emitter.on('playerSitting', cb);
    emitter.on('playerRunning', cb);
    return () => {
      emitter.off('updateHotButtons', cb);
      emitter.off('playerSitting', cb);
      emitter.off('playerRunning', cb);
    };
  }, [props.actionData]);

  const text = useMemo(() => {
    switch (props.actionData?.type) {
      case ActionButtonType.WHO:
        return 'Who';
      case ActionButtonType.INVITE:
        return 'Invite';
      case ActionButtonType.DISBAND:
        return 'Disband';
      case ActionButtonType.CAMP:
        return 'Camp';
      case ActionButtonType.HELP:
        return 'Help';
      case ActionButtonType.PERSONA:
        return 'Persona';
      case ActionButtonType.OPTIONS:
        return 'Options';
      case ActionButtonType.ABILITIES:
        return 'Abilities';
      case ActionButtonType.SPELLS:
        return 'Spells';
      case ActionButtonType.INVENTORY:
        return 'Inventory';
      case ActionButtonType.OPTIONS:
        return 'Options';
      case ActionButtonType.MELEE_ATTACK:
        return 'Melee';
      case ActionButtonType.RANGED_ATTACK:
        return 'Ranged';
      case ActionButtonType.SIT:
        return Player.instance?.Sitting ? 'Stand' : 'Sit';
      case ActionButtonType.WALK:
        return Player.instance?.Running ? 'Walk' : 'Run';
      case ActionButtonType.SOCIALS:
        return (
          props.actionButtonConfig?.socialButtons?.[
            props.actionData?.index ?? 0
          ]?.label ?? 'Socials'
        );
      case ActionButtonType.COMBAT:
        return (
          props.actionButtonConfig?.combatButtons?.[
            props.actionData?.index ?? 0
          ]?.label ?? `Combat ${props.index}`
        );
      default:
        return props.actionData?.label ?? '';
    }
  }, [props.actionData, props.actionButtonConfig, props.index, forceRender]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = dropRef.current;
    if (!el) {
      return;
    }

    const handler = (
      e: CustomEvent<{ data: FullActionData; originalEvent: MouseEvent }>,
    ) => {
      e.preventDefault();
      const dropped = e.detail.data;
      // only handle real “hot button” payloads
      if (dropped?.hotButton) {
        UserConfig.instance.swapHotButtons(
          props.index,
          dropped.hotButtonIndex!,
        );
      } else if (dropped) {
        UserConfig.instance.updateHotButton(
          props.index,
          dropped as ActionButtonData,
        );
      }
    };

    el.addEventListener('action-drop', handler as EventListener);
    return () => {
      el.removeEventListener('action-drop', handler as EventListener);
    };
  }, [props.index]);

  const hotButtonActionData = useMemo(
    () =>
      ({
        ...props.actionData,
        hotButton     : true,
        hotButtonIndex: props.index,
      }) as FullActionData,
    [props.actionData, props.index],
  );

  return (
    <Box ref={dropRef} data-hot-button={props.index} sx={{ p: 1 }}>
      <ActionButton
        {...props}
        actionData={hotButtonActionData}
        action={action}
        buttonName={buttonName}
        text={text}
        size={110}
      />
    </Box>
  );
};
