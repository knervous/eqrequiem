import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import https from "https";

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
  ...(process.env.LOCAL_DEV === "true" && {
    resolve: {
      alias: {
        "sage-core": path.resolve(__dirname, "../../eqsage/sage/lib"),
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
