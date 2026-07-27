import { useEffect, useMemo, useRef, useState } from 'react';
import { CommandHandler } from '@game/ChatCommands/command-handler';
import { UserConfig } from '@game/Config/config';
import type { ActionButtonsConfig } from '@game/Config/types';
import { useEventArg } from '@game/Events/event-hooks';
import emitter from '@game/Events/events';
import Player from '@game/Player/player';
import { Box } from '@mui/material';
import { ActionButtonData, ActionButtonType, FullActionData, FullItemEntryData } from './constants';
import { useImmediateDragClone } from './hooks';
import { ItemButton } from './item-button';


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
  playerAction?: boolean;
  buttonName?: string;
}

const buttonMap = {
  [ActionButtonType.ABILITIES]: 'abilityButtons',
  [ActionButtonType.SOCIALS]  : 'socialButtons',
  [ActionButtonType.COMBAT]   : 'combatButtons',
} as Record<ActionButtonType, keyof ActionButtonsConfig>;

export const ActionButton: React.FC<ActionButtonProps> = (props) => {
  const { elementRef, onMouseDown } = useImmediateDragClone<HTMLButtonElement>(
    props.scale ?? 1,
    props.actionData,
  );
  const buttonAction = useMemo(
    () =>
      props.playerAction ? () => props.action(props.actionData) : props.action,
    [props],
  );

  return (
    <Box
      component="button"
      type="button"
      ref={elementRef}
      className="action-button rq-action-button"
      sx={props.useDefaultSize ? {} : {
        width : props.size ?? 48,
        height: props.size ?? 48,
      }}
      onClick={(event) => {
        buttonAction();
        event.currentTarget.blur();
      }}
      onMouseDown={onMouseDown}
    >
      <span>{props.text ?? props.actionData?.label ?? ''}</span>
    </Box>
  );
};

export const ActionHotButton: React.FC<HotButtonProps> = (props) => {
  const dropRef = useRef<HTMLDivElement>(null);

  const linkedActionData: ActionButtonData | undefined = useMemo(() => {
    const { actionData, actionButtonConfig } = props;
    if (!actionButtonConfig || !actionData) {
      return undefined;
    }
    const actionButton = actionButtonConfig[buttonMap[actionData.type]];
    if (!actionButton) {
      return undefined;
    }
    return actionButton[actionData.index ?? 0];
  }, [props]);

  const action: () => void = useMemo(() => {
    const player = Player.instance;
    if (!player) {
      return () => console.log('No player instance');
    }
    const { actionButtonConfig, actionData } = props;
    if (!actionButtonConfig || !actionData) {
      return () => console.log('No action button config or action data');
    }
    switch (actionData.type) {
      case ActionButtonType.WHO:
        return CommandHandler.instance().commandWho.bind(CommandHandler.instance);
      case ActionButtonType.INVITE:
        return CommandHandler.instance().commandInvite.bind(
          CommandHandler.instance,
        );
      case ActionButtonType.DISBAND:
        return CommandHandler.instance().commandDisband.bind(
          CommandHandler.instance,
        );
      case ActionButtonType.CAMP:
        return CommandHandler.instance().commandCamp.bind(
          CommandHandler.instance,
        );
      case ActionButtonType.HELP:
        return CommandHandler.instance().commandHelp.bind(
          CommandHandler.instance,
        );
      case ActionButtonType.PERSONA:
        return CommandHandler.instance().commandPersona.bind(
          CommandHandler.instance,
        );
      case ActionButtonType.OPTIONS:
        return CommandHandler.instance().commandOptions.bind(
          CommandHandler.instance,
        );
      case ActionButtonType.INVENTORY:
        return () => player.playerInventory.useItem(props.actionData?.index ?? -1);
      case ActionButtonType.MELEE_ATTACK:
        return player.autoAttack.bind(player);
      case ActionButtonType.RANGED_ATTACK:
        return player.rangedAttack.bind(player);
      case ActionButtonType.SIT:
        return player.toggleSit.bind(player);
      case ActionButtonType.WALK:
        return player.toggleWalk.bind(player);
      case ActionButtonType.ABILITIES:
      case ActionButtonType.SOCIALS:
      case ActionButtonType.COMBAT: {
        return () => player.doAction(linkedActionData);
      }
      default:
        return () => console.log('Default action triggered');
    }
  }, [props, linkedActionData]) as () => void;

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

  const text = useMemo(
    () => {
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
        case ActionButtonType.SPELLS:
          return 'Spells';
        case ActionButtonType.INVENTORY:
          return 'Inventory';
        case ActionButtonType.MELEE_ATTACK:
          return 'Melee';
        case ActionButtonType.RANGED_ATTACK:
          return 'Ranged';
        case ActionButtonType.SIT:
          return Player.instance?.Sitting ? 'Stand' : 'Sit';
        case ActionButtonType.WALK:
          return Player.instance?.Running ? 'Walk' : 'Run';
        case ActionButtonType.SOCIALS:
        case ActionButtonType.COMBAT:
        case ActionButtonType.ABILITIES: {
          // For these types, we use the label from the action data
          return linkedActionData?.label ?? '';
        }
        default:
          return props.actionData?.label ?? '';
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      props.actionData,
      props.actionButtonConfig,
      props.index,
      linkedActionData,
      forceRender,
    ],
  );

  useEventArg('hotkey', action, props.index);

  // For Action Buttons
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
        console.log('Dropped action data:', dropped);
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

  // For Inventory Items
  useEffect(() => {
    const el = dropRef.current;
    if (!el) {
      return;
    }
    const handler = (
      e: CustomEvent<{ data: FullItemEntryData; originalEvent: MouseEvent }>,
    ) => {
      e.preventDefault();
      const dropped = e.detail.data;
      if (dropped?.hotButton) {
        UserConfig.instance.swapHotButtons(
          props.index,
          dropped.hotButtonIndex!,
        );
      } else if (dropped) {
        console.log('Dropped action data:', dropped);
        UserConfig.instance.updateHotButton(
          props.index,
          {
            type : ActionButtonType.INVENTORY,
            index: dropped.slot,
          } as ActionButtonData,
        );
      }
    };
    
    el.addEventListener('item-drop', handler as EventListener);
    return () => {
      el.removeEventListener('item-drop', handler as EventListener);
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

  const inventoryButton = useMemo(() => props.actionData?.type === ActionButtonType.INVENTORY, [props.actionData]);

  const linkedButton = useMemo(() => { 
    if (props.actionData?.type === ActionButtonType.INVENTORY) {
      return <ItemButton
        hotButton={true}
        hotButtonIndex={props.index}
        scale={(props.scale ?? 1)}
        slot={props.actionData.index ?? -1}
      />;
    }

    return <ActionButton
      {...props}
      action={action}
      actionData={hotButtonActionData}
      buttonName={buttonName}
      size={props.size ?? 48}
      text={text}
    />;

  }, [action, props, hotButtonActionData, buttonName, text]);

  return (
    <Box ref={dropRef} data-hot-button={props.index} sx={inventoryButton ? {
      width : props.size ?? '48px',
      height: props.size ?? '48px',
    } : {}}>
      {linkedButton}
    </Box>
  );
};
