import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { LibraApp } from '@requiem-subapp/libra';
import { ReturnToRequiem } from './return-to-requiem';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Libra root element not found');
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter basename="/apps/libra">
      <ReturnToRequiem />
      <LibraApp />
    </BrowserRouter>
  </StrictMode>,
);
