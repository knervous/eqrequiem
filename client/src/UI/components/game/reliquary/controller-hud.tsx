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

  useEffect(() => {
    const refresh = () => {
      const config = UserConfig.instance.getConfig();
      setUI({ ...config.ui });
      setBindings({ ...config.gamepadBindings });
    };
    emitter.on('updateUI', refresh);
    emitter.on('updateGamepad', refresh);
    return () => {
      emitter.off('updateUI', refresh);
      emitter.off('updateGamepad', refresh);
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

  if (!visible) return null;
  if (ui.controllerHudAutoHide && !pad) return null;
  if (rows.length === 0) return null;

  return (
    <div className="rq-pad-hud" data-testid="controller-hud">
      <div className="rq-pad-hud__title">
        <span>Controller</span>
        <small>{pad ? 'connected' : 'waiting'}</small>
      </div>
      <ul>
        {rows.map((row) => {
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
        })}
      </ul>
    </div>
  );
};

export default ControllerHud;
