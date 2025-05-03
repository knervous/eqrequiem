import ReactDOM from "react-dom/client";
import { App } from "./App.tsx";

const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
console.log = function(...args: any[]) {
  if (typeof args[0] === 'string' && args[0]?.startsWith('[jsbb]')) {
    return;
  }
  originalConsoleLog(...args);
};

console.error = function(...args: any[]) {
  if (typeof args[0] === 'string' && args[0]?.startsWith('[jsbb]')) {
    return;
  }
  if (typeof args[0] === 'string' && args[0]?.startsWith('WARNING: The load-time scene is not defined')) { 
    return;
  }
  originalConsoleError(...args);
};

console.warn = function(...args: any[]) {
  if (typeof args[0] === 'string' && args[0]?.startsWith('[jsbb]')) {
    return;
  }
  originalConsoleWarn(...args);
}; 

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
