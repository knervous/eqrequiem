// File: client/src/UI/components/game/reliquary/controls-options.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { UserConfig } from '@game/Config/config';
import {
  detectGamepadBinding,
  presentGamepadBinding,
  selectActiveGamepad,
  type GamepadAxisAction,
  type GamepadDigitalAction,
  type GamepadLike,
} from '@game/Config/gamepad-bindings';
import { keyboardEventToBinding } from '@game/Config/key-bindings';
import type { GamepadBindings, KeyBindings } from '@game/Config/types';
import emitter from '@game/Events/events';
import {
  getWebHidGamepad,
  isWebHidSupported,
} from '@game/Player/webhid-gamepad';

type GamepadAction = GamepadDigitalAction | GamepadAxisAction;

const keybindGroups: ReadonlyArray<{
  title: string;
  keys: ReadonlyArray<keyof KeyBindings>;
}> = [
  {
    title: 'Movement',
    keys: [
      'moveForward',
      'moveBackward',
      'turnLeft',
      'turnRight',
      'jump',
      'crouch',
      'sprint',
      'autoRun',
      'sitStand',
    ],
  },
  {
    title: 'Targeting & combat',
    keys: ['targetNearest', 'targetPrevious', 'autoAttack', 'hail', 'consider'],
  },
  {
    title: 'Windows',
    keys: ['inventory', 'spells', 'options', 'reply'],
  },
  {
    title: 'Hot buttons',
    keys: [
      'hotkey1',
      'hotkey2',
      'hotkey3',
      'hotkey4',
      'hotkey5',
      'hotkey6',
      'hotkey7',
      'hotkey8',
      'hotkey9',
      'hotkey10',
    ],
  },
];

const gamepadGroups: ReadonlyArray<{
  title: string;
  actions: ReadonlyArray<GamepadAction>;
  allowAxes?: boolean;
}> = [
  {
    title: 'Sticks',
    actions: ['moveAxisX', 'moveAxisY', 'lookAxisX', 'lookAxisY'],
    allowAxes: true,
  },
  {
    title: 'Movement',
    actions: ['jump', 'sprint', 'crouch', 'autoRun', 'sitStand', 'cameraToggle'],
  },
  {
    title: 'Targeting & combat',
    actions: [
      'targetNearest',
      'clearTarget',
      'autoAttack',
      'hail',
      'consider',
    ],
  },
  {
    title: 'Windows',
    actions: ['inventory', 'options'],
  },
  {
    title: 'Hot buttons',
    actions: ['hotkeyModifier', 'hotkey1', 'hotkey2', 'hotkey3', 'hotkey4'],
  },
];

const actionLabels: Partial<Record<GamepadAction | keyof KeyBindings, string>> = {
  moveAxisX: 'Move / strafe axis',
  moveAxisY: 'Move forward axis',
  lookAxisX: 'Look horizontal axis',
  lookAxisY: 'Look vertical axis',
  cameraToggle: 'First / third person',
  clearTarget: 'Clear target',
  hotkeyModifier: 'Hot button shift',
  targetNearest: 'Target nearest',
  targetPrevious: 'Target previous',
  autoAttack: 'Auto attack',
  autoRun: 'Auto run',
  sitStand: 'Sit / stand',
  moveForward: 'Move forward',
  moveBackward: 'Move backward',
  turnLeft: 'Turn / strafe left',
  turnRight: 'Turn / strafe right',
};

const presentActionName = (name: string) =>
  actionLabels[name as GamepadAction] ??
  name
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .replace(/^./, (letter) => letter.toUpperCase());

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta']);

const readGamepads = (): (GamepadLike | null)[] => {
  const pads = navigator.getGamepads?.();
  return pads ? (Array.from(pads) as (GamepadLike | null)[]) : [];
};

/**
 * Live connection state plus a low-rate sample of the active pad. A controller
 * paired over WebHID takes priority, since one is only ever paired because the
 * Gamepad API could not see it.
 */
const useActiveGamepad = (polling: boolean) => {
  const [gamepad, setGamepad] = useState<GamepadLike | null>(null);

  useEffect(() => {
    if (!polling) return;
    const sample = () =>
      setGamepad(
        getWebHidGamepad().current ?? selectActiveGamepad(readGamepads()),
      );
    sample();
    const timer = window.setInterval(sample, 100);
    return () => window.clearInterval(timer);
  }, [polling]);

  return gamepad;
};

/**
 * Pairing controls for controllers the browser's Gamepad API never reports.
 * On macOS the Switch Pro Controller is claimed by the system's own Game
 * Controller framework, so it drives native games while staying invisible to
 * Chrome; opening it as a raw HID device is the way around that.
 */
const WebHidPairing: React.FC<{ detected: boolean }> = ({ detected }) => {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const supported = isWebHidSupported();

  if (!supported) {
    return (
      <p className="rq-controls__hint" data-testid="webhid-unsupported">
        This browser has no WebHID support, so a controller the Gamepad API
        cannot see has no fallback here. Chrome, Edge and Opera support it.
      </p>
    );
  }

  const pair = async () => {
    setBusy(true);
    setStatus(null);
    const ok = await getWebHidGamepad().requestDevice();
    setBusy(false);
    setStatus(
      ok
        ? 'Controller paired. Move a stick to confirm it reports below.'
        : 'No controller was selected. If the picker was empty, the device is likely held by another app.',
    );
  };

  return (
    <div className="rq-webhid">
      <p className="rq-controls__hint">
        {detected
          ? 'A controller is already reporting. Pairing over HID is only needed when nothing shows up.'
          : 'If your controller works in other apps but reports nothing above, pair it directly. Switch Pro Controllers on macOS usually need this.'}
      </p>
      <button
        className="rq-options__reset"
        data-testid="webhid-pair"
        disabled={busy}
        onClick={() => void pair()}
      >
        {busy ? 'Waiting for selection…' : 'Pair controller over HID'}
      </button>
      {status ? (
        <p className="rq-controls__hint" data-testid="webhid-status">
          {status}
        </p>
      ) : null}
    </div>
  );
};

/**
 * Shows exactly what the browser reports for the attached pad. A controller
 * that does nothing in game is almost always one the browser never exposed, or
 * one that reports a non-standard button and axis order — both are visible
 * here without having to guess.
 */
const GamepadMonitor: React.FC<{ gamepad: GamepadLike | null }> = ({
  gamepad,
}) => {
  if (!gamepad) {
    return (
      <div className="rq-pad-monitor" data-testid="gamepad-monitor">
        <p className="rq-pad-monitor__empty">
          Nothing reported yet. Browsers only reveal a controller after you
          press one of its buttons with this window focused.
        </p>
      </div>
    );
  }

  const nonStandard = gamepad.mapping !== 'standard';
  const pressed = (gamepad.buttons ?? [])
    .map((button, index) => ({ button, index }))
    .filter(({ button }) => button.pressed || (button.value ?? 0) >= 0.5);

  return (
    <div className="rq-pad-monitor" data-testid="gamepad-monitor">
      {nonStandard ? (
        <p className="rq-pad-monitor__warning" data-testid="gamepad-nonstandard">
          This controller reports a non-standard layout
          {gamepad.mapping ? ` ("${gamepad.mapping}")` : ''}, so the default
          bindings below may point at the wrong buttons. Use the readout to
          find the right ones and rebind.
        </p>
      ) : null}
      <div className="rq-pad-monitor__axes">
        {(gamepad.axes ?? []).map((value, index) => (
          <div className="rq-pad-axis" key={index}>
            <span>Axis {index}</span>
            <div className="rq-pad-axis__track">
              <i style={{ left: `${((value + 1) / 2) * 100}%` }} />
            </div>
            <output data-testid={`gamepad-axis-${index}`}>
              {value.toFixed(2)}
            </output>
          </div>
        ))}
      </div>
      <div className="rq-pad-monitor__buttons" data-testid="gamepad-pressed">
        {pressed.length === 0
          ? 'No buttons held'
          : pressed
            .map(({ index }) => `${index} (${presentGamepadBinding(`Button${index}`)})`)
            .join(', ')}
      </div>
    </div>
  );
};

export const ControlsOptions: React.FC = () => {
  const [, setRevision] = useState(0);
  const [capturingKey, setCapturingKey] = useState<keyof KeyBindings | null>(
    null,
  );
  const [capturingPad, setCapturingPad] = useState<GamepadAction | null>(null);
  const captureAllowsAxes = useRef(false);
  const pendingModifier = useRef<string | null>(null);
  const config = UserConfig.instance.getConfig();
  const gamepad = useActiveGamepad(true);

  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  const commitKeybind = useCallback(
    (key: keyof KeyBindings, binding: string) => {
      UserConfig.instance.updateKeybind(key, binding);
      setCapturingKey(null);
      refresh();
    },
    [refresh],
  );

  useEffect(() => {
    emitter.on('updateGamepad', refresh);
    emitter.on('updateKeybinds', refresh);
    return () => {
      emitter.off('updateGamepad', refresh);
      emitter.off('updateKeybinds', refresh);
    };
  }, [refresh]);

  // Controller capture. Whatever the pad already reports when the row opens is
  // treated as the resting state, so a held button or a leaning stick can't
  // bind itself the instant you click. Releasing it clears the baseline.
  useEffect(() => {
    if (!capturingPad) return;
    let baseline: string | null | undefined;
    const timer = window.setInterval(() => {
      const pad = selectActiveGamepad(readGamepads());
      const binding = detectGamepadBinding(pad, {
        allowAxes: captureAllowsAxes.current,
      });
      if (baseline === undefined) {
        baseline = binding;
        return;
      }
      if (!binding) {
        baseline = null;
        return;
      }
      if (binding === baseline) return;
      UserConfig.instance.updateGamepadBinding(
        capturingPad as keyof GamepadBindings,
        binding,
      );
      setCapturingPad(null);
      refresh();
    }, 40);
    return () => window.clearInterval(timer);
  }, [capturingPad, refresh]);

  const beginPadCapture = (action: GamepadAction, allowAxes: boolean) => {
    captureAllowsAxes.current = allowAxes;
    setCapturingKey(null);
    setCapturingPad(action);
  };

  const gamepadSettings = config.gamepad;
  const updateGamepadSetting = <K extends keyof typeof gamepadSettings>(
    key: K,
    value: (typeof gamepadSettings)[K],
  ) => {
    UserConfig.instance.updateGamepadSetting(key, value);
    refresh();
  };

  return (
    <div className="rq-controls" data-testid="controls-options">
      <h2>Keyboard</h2>
      <div className="rq-controls__hint">
        Select a binding, then press the key you want to use. Escape cancels.
      </div>
      {keybindGroups.map((group) => (
        <section className="rq-bind-group" key={group.title}>
          <h3>{group.title}</h3>
          <div className="rq-keybind-list">
            {group.keys.map((key) => (
              <div className="rq-keybind-row" key={key}>
                <span>{presentActionName(key)}</span>
                <button
                  data-testid={`keybind-${key}`}
                  className={capturingKey === key ? 'is-capturing' : ''}
                  onClick={() => {
                    setCapturingPad(null);
                    setCapturingKey(key);
                  }}
                  onBlur={() =>
                    setCapturingKey((current) =>
                      current === key ? null : current,
                    )
                  }
                  onKeyDown={(event) => {
                    if (capturingKey !== key) return;
                    event.preventDefault();
                    event.stopPropagation();
                    if (event.key === 'Escape') {
                      pendingModifier.current = null;
                      setCapturingKey(null);
                      return;
                    }
                    // A modifier on its own is only a binding once it is
                    // released; until then it may still be the start of a
                    // combination such as Ctrl+S.
                    if (MODIFIER_KEYS.has(event.key)) {
                      pendingModifier.current = keyboardEventToBinding(
                        event.nativeEvent,
                      );
                      return;
                    }
                    pendingModifier.current = null;
                    const nextBinding = keyboardEventToBinding(
                      event.nativeEvent,
                    );
                    if (!nextBinding) return;
                    commitKeybind(key, nextBinding);
                  }}
                  onKeyUp={(event) => {
                    if (capturingKey !== key) return;
                    if (!MODIFIER_KEYS.has(event.key)) return;
                    const pending = pendingModifier.current;
                    pendingModifier.current = null;
                    if (pending) commitKeybind(key, pending);
                  }}
                >
                  {capturingKey === key
                    ? 'Press a key…'
                    : config.keyBindings[key] || 'Unbound'}
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}
      <button
        className="rq-options__reset"
        data-testid="reset-keybinds"
        onClick={() => {
          UserConfig.instance.resetKeybinds();
          refresh();
        }}
      >
        Reset keyboard defaults
      </button>

      <h2>Controller</h2>
      <div className="rq-controls__status" data-testid="gamepad-status">
        {gamepad
          ? `Connected: ${gamepad.id ?? 'Gamepad'}`
          : 'No controller detected. Connect one and press any button.'}
      </div>
      <GamepadMonitor gamepad={gamepad} />
      <WebHidPairing detected={Boolean(gamepad)} />
      <label className="rq-option-toggle">
        <span>
          <strong>Enable controller</strong>
          <small>Read stick and button input while you play.</small>
        </span>
        <input
          type="checkbox"
          data-testid="gamepad-enabled"
          checked={gamepadSettings.enabled}
          onChange={(event) =>
            updateGamepadSetting('enabled', event.target.checked)
          }
        />
      </label>
      <label className="rq-option-range">
        <span>
          <strong>Stick deadzone</strong>
          <output>{Math.round(gamepadSettings.deadzone * 100)}%</output>
        </span>
        <input
          type="range"
          data-testid="gamepad-deadzone"
          min="0"
          max="0.6"
          step="0.01"
          value={gamepadSettings.deadzone}
          onChange={(event) =>
            updateGamepadSetting('deadzone', Number(event.target.value))
          }
        />
      </label>
      <label className="rq-option-range">
        <span>
          <strong>Look sensitivity</strong>
          <output>{gamepadSettings.lookSensitivity.toFixed(2)}×</output>
        </span>
        <input
          type="range"
          data-testid="gamepad-sensitivity"
          min="0.2"
          max="3"
          step="0.05"
          value={gamepadSettings.lookSensitivity}
          onChange={(event) =>
            updateGamepadSetting('lookSensitivity', Number(event.target.value))
          }
        />
      </label>
      <label className="rq-option-toggle">
        <span>
          <strong>Invert look</strong>
          <small>Flip the vertical camera axis.</small>
        </span>
        <input
          type="checkbox"
          data-testid="gamepad-invert-look"
          checked={gamepadSettings.invertLookY}
          onChange={(event) =>
            updateGamepadSetting('invertLookY', event.target.checked)
          }
        />
      </label>
      <label className="rq-option-toggle">
        <span>
          <strong>Invert movement</strong>
          <small>Flip forward and backward on the left stick.</small>
        </span>
        <input
          type="checkbox"
          data-testid="gamepad-invert-move"
          checked={gamepadSettings.invertMoveY}
          onChange={(event) =>
            updateGamepadSetting('invertMoveY', event.target.checked)
          }
        />
      </label>

      <div className="rq-controls__hint">
        Hold the hot button shift to reach hot buttons five through eight from
        the same four buttons.
      </div>
      {gamepadGroups.map((group) => (
        <section className="rq-bind-group" key={group.title}>
          <h3>{group.title}</h3>
          <div className="rq-keybind-list">
            {group.actions.map((action) => (
              <div className="rq-keybind-row" key={action}>
                <span>{presentActionName(action)}</span>
                <button
                  data-testid={`gamepad-bind-${action}`}
                  className={capturingPad === action ? 'is-capturing' : ''}
                  onClick={() =>
                    beginPadCapture(action, Boolean(group.allowAxes))
                  }
                  onKeyDown={(event) => {
                    if (capturingPad !== action) return;
                    if (event.key === 'Escape') setCapturingPad(null);
                  }}
                >
                  {capturingPad === action
                    ? group.allowAxes
                      ? 'Move a stick…'
                      : 'Press a button…'
                    : presentGamepadBinding(config.gamepadBindings[action])}
                </button>
                <button
                  className="rq-keybind-clear"
                  data-testid={`gamepad-clear-${action}`}
                  aria-label={`Clear ${presentActionName(action)}`}
                  onClick={() => {
                    UserConfig.instance.updateGamepadBinding(action, '');
                    refresh();
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}
      <button
        className="rq-options__reset"
        data-testid="reset-gamepad"
        onClick={() => {
          UserConfig.instance.resetGamepadBindings();
          refresh();
        }}
      >
        Reset controller defaults
      </button>
    </div>
  );
};

export default ControlsOptions;
