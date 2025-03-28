import ReactDOM from "react-dom/client";
import { App } from "./App.tsx";

const originalConsoleLog = console.log;
console.log = function(...args: any[]) {
  if (args[0]?.startsWith('[jsbb]')) {
    return;
  }
  originalConsoleLog(...args);
};


ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
