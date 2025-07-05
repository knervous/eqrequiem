import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import * as https from 'https';
import fetch from 'node-fetch';

const agent = new https.Agent({
  rejectUnauthorized: false,
});
const isLocalDev = process.env.VITE_LOCAL_DEV === "true";
export default defineConfig({
  base: "./",
  plugins: [
    react({
      tsDecorators: true,
      swcOptions: {
        jsc: {
          parser: {
            syntax: "typescript",
            tsx: true,
            decorators: true,
          },
          transform: {
            legacyDecorator: true,
            decoratorMetadata: false,
          },
        },
      },
    }),
    {
      configureServer: ({ middlewares }) => {
        middlewares.use(async (req, res, next) => {
          if (req.url?.startsWith("/api/hash")) {
            const params = new URLSearchParams(req.url.split("?")[1]);
            const port = params.get("port");
            const ip = params.get("ip");
            const hash = await fetch(`http://${ip}:${port}/hash`)
              .then((r) => r.text())
              .catch(() => "");

            res.end(hash);
            return;
          }
          if (req.url?.startsWith("/api/playercount")) {
            const playerCount = await fetch(`https://127.0.0.1/playercount`,  { agent })
              .then((r) => r.json())
              .catch((e) => {
                console.error("Error fetching player count:", e);
                return { count: -1  };
              });
            if (!playerCount) {
              res.statusCode = 500;
              res.end("Failed to fetch hash");
              return;
            }
            res.end(JSON.stringify(playerCount));
            return;
          }
          res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
          res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
          next();
        });
      },
    },
  ],
  resolve: {
    alias: {
      react: path.resolve(__dirname, "./node_modules/react"),
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
      "react/jsx-runtime": path.resolve(
        __dirname,
        "./node_modules/react/jsx-runtime.js",
      ),
      "react-router-dom": path.resolve(
        __dirname,
        "./node_modules/react-router-dom",
      ),
      "@mui/material": path.resolve(__dirname, "./node_modules/@mui/material"),
      "use-debounce": path.resolve(__dirname, "./node_modules/use-debounce"),
      "use-context-selector": path.resolve(
        __dirname,
        "./node_modules/use-context-selector",
      ),
      "tga-js": path.resolve(__dirname, "./node_modules/tga-js"),
      ...(isLocalDev
        ? {
          "sage-core": path.resolve(__dirname, "../../eqsage/sage/lib"),
        }
        : {}),
      "@game": path.resolve(__dirname, "src/Game"),
      "@eqmessage": path.resolve(__dirname, "src/Game/Net/internal/api/capnp"),
      "@@opcode": path.resolve(__dirname, "src/Game/Net/opcodes.ts"),
      "@ui": path.resolve(__dirname, "src/UI"),
      "@": path.resolve(__dirname, "src"),
      "@bjs": path.resolve(__dirname, "src/bjs/index.ts"),
    },
  },
  optimizeDeps: {
    exclude: isLocalDev ? ["@babylonjs/havok", "sage-core"] : ["@babylonjs/havok"],
    esbuildOptions: {
      target: "chrome90",
    },
  },
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
