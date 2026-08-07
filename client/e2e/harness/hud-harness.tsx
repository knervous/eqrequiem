// File: client/e2e/harness/hud-harness.tsx
//
// Mounts the controller HUD overlay on its own so its visibility rules and
// live press highlighting can be driven without booting a zone.
import { createRoot } from 'react-dom/client';
import { UserConfig } from '@game/Config/config';
import { ControllerHud } from '@ui/components/game/reliquary/controller-hud';
import emitter from '@game/Events/events';

const container = document.getElementById('root');
if (!container) throw new Error('hud harness: missing #root');

UserConfig.instance.reset();
createRoot(container).render(<ControllerHud />);

declare global {
  interface Window {
    hudHarness: {
      setUi: (key: string, value: unknown) => void;
      setBinding: (action: string, binding: string) => void;
      reset: () => void;
    };
  }
}

window.hudHarness = {
  setUi: (key, value) => {
    UserConfig.instance.updateUISetting(key as never, value as never);
    emitter.emit('updateUI');
  },
  setBinding: (action, binding) => {
    UserConfig.instance.updateGamepadBinding(action as never, binding);
    emitter.emit('updateGamepad');
  },
  reset: () => {
    UserConfig.instance.reset();
    emitter.emit('updateUI');
    emitter.emit('updateGamepad');
  },
};
