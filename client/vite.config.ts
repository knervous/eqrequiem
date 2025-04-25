import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import https from "https";

const isLocalDev = process.env.LOCAL_DEV === "true";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    {
      configureServer: ({ middlewares }) => {
        middlewares.use(async (req, res, next) => {
          if (req.url?.startsWith("/api/hash")) {
            const params = new URLSearchParams(req.url?.split("?")[1]);
            const port = params.get("port");
            const ip = params.get("ip");
            const hash = await fetch(`http://${ip}:${port}/hash`)
              .then((r) => r.text())
              .catch((_) => "");
            res.end(hash);
            return;
          }
          if (req.url.includes('Test.wasm')) {
            res.setHeader("Content-Encoding", "br");
          }
          if (req.url.includes('Test.pck')) {
            res.setHeader("Content-Encoding", "br");
          }
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
      //'@protobuf-ts/runtime': path.resolve(__dirname, '../ui/node_modules/@protobuf-ts/runtime'),
      "react/jsx-runtime": path.resolve(
        __dirname,
        "./node_modules/react/jsx-runtime.js",
      ),
      "react-router-dom": path.resolve(
        __dirname,
        "./node_modules/react-router-dom",
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
      godot: path.resolve(__dirname, "./src/godot-module.ts"),
      "@game": path.resolve(__dirname, "src/Game"),
      "@ui": path.resolve(__dirname, "src/UI"),
      "@": path.resolve(__dirname, "src"),
    },
  },
  ...(isLocalDev && {
    resolve: {
      alias: {
        //'@protobuf-ts/runtime': path.resolve(__dirname, '../ui/node_modules/@protobuf-ts/runtime'),
        "react/jsx-runtime": path.resolve(
          __dirname,
          "./node_modules/react/jsx-runtime.js",
        ),
        "react-router-dom": path.resolve(
          __dirname,
          "./node_modules/react-router-dom",
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
        godot: path.resolve(__dirname, "./src/godot-module.ts"),
        classnames: path.resolve(__dirname, "./classnames.js"),
        "@game": path.resolve(__dirname, "src/Game"),
        "@ui": path.resolve(__dirname, "src/UI"),
        "@": path.resolve(__dirname, "src"),
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
