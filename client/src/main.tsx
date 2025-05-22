import ReactDOM from "react-dom/client";
import bjs from '@bjs';

async function render() {
  import('./App').then(({ App }) => {
    const root = document.getElementById("root");
    if (!root) {
      throw new Error("Root element not found");
    }
    ReactDOM.createRoot(root).render(<App />);
  },
  );    
}

bjs.initialize().then(render);

