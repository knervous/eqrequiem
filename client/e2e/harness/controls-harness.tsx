// File: client/e2e/harness/controls-harness.tsx
//
// Mounts the Controls options panel on its own so Playwright can drive the
// rebinding flows without booting a scene or logging in.
import { createRoot } from 'react-dom/client';
import { UserConfig } from '@game/Config/config';
import { ControlsOptions } from '@ui/components/game/reliquary/controls-options';
import '@ui/components/game/reliquary/reliquary.css';

const container = document.getElementById('root');
if (!container) throw new Error('controls harness: missing #root');

UserConfig.instance.reset();
createRoot(container).render(<ControlsOptions />);

declare global {
  interface Window {
    controlsHarness: {
      config: () => ReturnType<typeof UserConfig.instance.getConfig>;
      reset: () => void;
    };
  }
}

window.controlsHarness = {
  config: () => UserConfig.instance.getConfig(),
  reset: () => UserConfig.instance.reset(),
};
