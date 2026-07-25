import { createRoot } from 'react-dom/client';
import { SandboxApp } from '@requiem-subapp/sandbox';
import { ReturnToRequiem } from './return-to-requiem';

const basePath = '/apps/sandbox';
window.__SHADO_SANDBOX_BASE_PATH__ = basePath;

const root = document.getElementById('root');
if (!root) {
  throw new Error('Sandbox root element not found');
}

createRoot(root).render(
  <>
    <ReturnToRequiem />
    <SandboxApp basePath={basePath} />
  </>,
);

declare global {
  interface Window {
    __SHADO_SANDBOX_BASE_PATH__?: string;
  }
}
