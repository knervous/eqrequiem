import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { LibraApp } from '@requiem-subapp/libra';
import { ReturnToEltania } from './return-to-eltania';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Libra root element not found');
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter basename="/apps/libra">
      <ReturnToEltania />
      <LibraApp />
    </BrowserRouter>
  </StrictMode>,
);
