// File: client/src/UI/components/game/reliquary/controller-hud.tsx
import { useEffect, useMemo, useState } from 'react';
import { UserConfig } from '@game/Config/config';
import {
  isButtonPressed,
  parseButtonBinding,
  presentGamepadBindingShort,
  selectActiveGamepad,
  type GamepadDigitalAction,
  type GamepadLike,
} from '@game/Config/gamepad-bindings';
import type { GamepadBindings, UISettings } from '@game/Config/types';
import emitter from '@game/Events/events';
import { getWebHidGamepad } from '@game/Player/webhid-gamepad';
import './controller-hud.css';

/**
 * The actions worth showing. This is a legend, not an exhaustive list: it
 * covers what a player reaches for without opening a window, in the order
 * they sit on the pad.
 */
const LEGEND: ReadonlyArray<{
  action: GamepadDigitalAction;
  label: string;
}> = [
  { action: 'jump', label: 'Jump' },
  { action: 'sitStand', label: 'Sit' },
  { action: 'interactPrimary', label: 'Interact' },
  { action: 'interactSecondary', label: 'Interact 2' },
  { action: 'targetNearest', label: 'Target' },
  { action: 'autoAttack', label: 'Attack' },
  { action: 'sprint', label: 'Sprint' },
  { action: 'autoRun', label: 'Auto run' },
  { action: 'inventory', label: 'Bags' },
  { action: 'options', label: 'Options' },
  { action: 'hotkeyModifier', label: 'Hot bar shift' },
];

/**
 * The D-pad drives hot bar slots, and those carry the actions that work at
 * range on your target -- Consider being the one players reach for most. Their
 * labels come from the hot bar itself, so the legend follows whatever the
 * player has actually put there.
 */
const HOTKEY_LEGEND: ReadonlyArray<{
  action: GamepadDigitalAction;
  slot: number;
}> = [
  { action: 'hotkey1', slot: 0 },
  { action: 'hotkey2', slot: 1 },
  { action: 'hotkey3', slot: 2 },
  { action: 'hotkey4', slot: 3 },
];

/** Falls back to the slot number when a hot button has no label of its own. */
const hotButtonLabel = (
  buttons: Record<number, { label?: string } | undefined>,
  slot: number,
): string | null => {
  const configured = buttons[slot];
  if (!configured) return null;
  return configured.label?.trim() || `Hot ${slot + 1}`;
};

const readPad = (): GamepadLike | null =>
  getWebHidGamepad().current ??
  selectActiveGamepad(
    (navigator.getGamepads?.() ?? []) as (GamepadLike | null)[],
  );

/**
 * On-screen controller legend. Shows what each bound button does and lights
 * up as they are pressed, which doubles as confirmation that the controller
 * is being read at all.
 */
export const ControllerHud: React.FC = () => {
  const [ui, setUI] = useState<UISettings>(
    () => UserConfig.instance.getConfig().ui,
  );
  const [bindings, setBindings] = useState<GamepadBindings>(
    () => UserConfig.instance.getConfig().gamepadBindings,
  );
  const [pad, setPad] = useState<GamepadLike | null>(null);
  const [hotButtons, setHotButtons] = useState<
    Record<number, { label?: string } | undefined>
  >(() => UserConfig.instance.getConfig().hotButtons);

  useEffect(() => {
    const refresh = () => {
      const config = UserConfig.instance.getConfig();
      setUI({ ...config.ui });
      setBindings({ ...config.gamepadBindings });
      setHotButtons({ ...config.hotButtons });
    };
    emitter.on('updateUI', refresh);
    emitter.on('updateGamepad', refresh);
    emitter.on('updateHotButtons', refresh);
    return () => {
      emitter.off('updateUI', refresh);
      emitter.off('updateGamepad', refresh);
      emitter.off('updateHotButtons', refresh);
    };
  }, []);

  const visible = ui.controllerHud;

  useEffect(() => {
    if (!visible) {
      setPad(null);
      return;
    }
    const sample = () => setPad(readPad());
    sample();
    const timer = window.setInterval(sample, 80);
    return () => window.clearInterval(timer);
  }, [visible]);

  const rows = useMemo(
    () =>
      LEGEND.map(({ action, label }) => {
        const binding = bindings[action];
        return {
          action,
          label,
          binding,
          index: parseButtonBinding(binding),
        };
      }).filter((row) => row.index !== null),
    [bindings],
  );

  const hotRows = useMemo(
    () =>
      HOTKEY_LEGEND.map(({ action, slot }) => {
        const binding = bindings[action];
        return {
          action,
          label: hotButtonLabel(hotButtons, slot),
          binding,
          index: parseButtonBinding(binding),
        };
      }).filter((row) => row.index !== null && row.label !== null),
    [bindings, hotButtons],
  );

  if (!visible) return null;
  if (ui.controllerHudAutoHide && !pad) return null;
  if (rows.length === 0 && hotRows.length === 0) return null;

  const renderRow = (row: {
    action: string;
    label: string | null;
    binding: string;
    index: number | null;
  }) => {
    const held = isButtonPressed(pad, row.index);
    return (
      <li
        key={row.action}
        className={held ? 'is-held' : ''}
        data-testid={`controller-hud-${row.action}`}
        data-held={held ? 'true' : 'false'}
      >
        <b>{presentGamepadBindingShort(row.binding)}</b>
        <span>{row.label}</span>
      </li>
    );
  };

  return (
    <div className="rq-pad-hud" data-testid="controller-hud">
      <div className="rq-pad-hud__title">
        <span>Controller</span>
        <small>{pad ? 'connected' : 'waiting'}</small>
      </div>
      <ul>{rows.map(renderRow)}</ul>
      {hotRows.length > 0 ? (
        <>
          <div className="rq-pad-hud__divider" data-testid="controller-hud-hotbar">
            Hot bar
          </div>
          <ul>{hotRows.map(renderRow)}</ul>
        </>
      ) : null}
    </div>
  );
};

export default ControllerHud;
