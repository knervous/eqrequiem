// Vite resolves JavaScript before TypeScript for extensionless imports. Keep
// this tracked compatibility entrypoint thin so the TSX implementation remains
// the single source of truth.
export { LoginWindowComponent } from './login-window.tsx';
