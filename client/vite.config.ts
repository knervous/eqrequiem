import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import https from "https";

const isLocalDev = process.env.LOCAL_DEV === "true";
const agent = new https.Agent({
  rejectUnauthorized: false,
});


export default defineConfig({
  base: "./",
  plugins: [
    react(),
    {
      configureServer: ({ middlewares }) => {
        middlewares.use((req, res, next) => {
          // if (req.url?.startsWith("/api/login")) {
            
          //   return;
          // }
          res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
          res.setHeader("Cross-Origin-Opener-Policy", "same-origin");

          next();
        });
      },
    },
  ],
  optimizeDeps: {
    esbuildOptions: {
      target: "chrome90",
    },
  },
  resolve: {
    alias: {
      "react/jsx-runtime": path.resolve(
        __dirname,
        "./node_modules/react/jsx-runtime.js",
      ),
      react: path.resolve(__dirname, "./node_modules/react"),
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
      "@mui/material": path.resolve(__dirname, "./node_modules/@mui/material"),
      "use-debounce": path.resolve(__dirname, "./node_modules/use-debounce"),
      "use-context-selector": path.resolve(
        __dirname,
        "./node_modules/use-context-selector",
      ),
      "tga-js": path.resolve(__dirname, "./node_modules/tga-js"),
    },
  },
  ...(isLocalDev && {
    resolve: {
      alias: {
        "react/jsx-runtime": path.resolve(
          __dirname,
          "./node_modules/react/jsx-runtime.js",
        ),
        "sage-core": path.resolve(__dirname, "../../eqsage/sage/lib"),
        react: path.resolve(__dirname, "./node_modules/react"),
        "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
        "@mui/material": path.resolve(
          __dirname,
          "./node_modules/@mui/material",
        ),
        "use-debounce": path.resolve(__dirname, "./node_modules/use-debounce"),
        "use-context-selector": path.resolve(
          __dirname,
          "./node_modules/use-context-selector",
        ),
        "tga-js": path.resolve(__dirname, "./node_modules/tga-js"),
      },
    },
    optimizeDeps: {
      exclude: ["sage-core"],
      esbuildOptions: {
        target: "chrome90",
      },
    },
  }),
  build: {
    target: "chrome90",
    commonjsOptions: {
      requireReturnsDefault: "preferred",
      transformMixedEsModules: true,
    },
  },
  worker: {
    format: "es",
  },
  server: {
    https: {
      key: fs.readFileSync("localhost.key"),
      cert: fs.readFileSync("localhost.crt"),
    },
    port: 3500,
  },
});
