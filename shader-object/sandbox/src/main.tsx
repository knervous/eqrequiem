import { createRoot } from 'react-dom/client'
import { ensureBABYLON } from '@knervous/shado'
import './index.css'
import App from './App.tsx'

ensureBABYLON().then(() => {
  createRoot(document.getElementById('root')!).render(
      <App />
  )
})
