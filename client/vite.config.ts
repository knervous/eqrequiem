import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import https from "https";

const agent = new https.Agent({
  rejectUnauthorized: false,
});

export default defineConfig({
  base:'./',
  plugins: [
    react(),
    {
      configureServer: ({ middlewares }) => {
        middlewares.use((req, res, next) => {
          res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
          res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
          next();
        });
      },
    },
  ],
  // resolve: {
  //   alias: ["ndarray", "ndarray-ops", "draco3dgltf", "buffer", "pako"].reduce(
  //     (acc, name) => (
  //       { ...acc, [name]: path.resolve(__dirname, `wrapper/${name}.js`) }
  //     ), {}
  //   ),
  // },
  build: {
    target: "chrome90",
    commonjsOptions: {
      // This option makes require() return a default property
      requireReturnsDefault: "preferred",
      transformMixedEsModules: true,
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "chrome90",
    },
  },
  // worker: {
  //   format: "es",
  // },
  server: {
    https: {
      key: fs.readFileSync("localhost.key"),
      cert: fs.readFileSync("localhost.crt"),
    },
    port: 3500,
    proxy: {
      "/api": {
        target: "https://localhost:3000",
        secure: false,
        agent,
        changeOrigin: true,
      },
    },
  },
});
