import fs from "node:fs";
import * as http from "node:http";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import * as https from "https";
import fetch from "node-fetch";

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});
const httpAgent = new http.Agent();
const agentFor = (url: string) =>
  url.startsWith("https://") ? httpsAgent : httpAgent;
const isLocalDev = process.env.VITE_LOCAL_DEV === "true";
const playerCountUrl = process.env.VITE_PLAYERCOUNT_URL;
const hashLookupTimeoutMs = Number(
  process.env.VITE_HASH_LOOKUP_TIMEOUT_MS || "1500",
);
const hashProviderUrl =
  process.env.VITE_HASH_PROVIDER_URL || "http://localhost:8082/hash";
const serverjsSourceRoot = path.resolve(__dirname, "../serverjs/src");

function serverjsTypeScriptSource(
  source: string,
  importer?: string,
): string | null {
  const importerPath = importer?.split("?", 1)[0];
  const isServerImport =
    source.includes("serverjs/src") || importerPath?.startsWith(serverjsSourceRoot);
  if (!isServerImport || source.startsWith("\0")) return null;
  const absolute = path.resolve(importerPath ? path.dirname(importerPath) : __dirname, source);
  const candidates = source.endsWith(".js")
    ? [`${absolute.slice(0, -3)}.ts`]
    : source.endsWith(".ts")
      ? [absolute]
      : [`${absolute}.ts`, path.join(absolute, "index.ts")];
  for (const candidate of candidates) {
    if (candidate.startsWith(serverjsSourceRoot) && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export default defineConfig({
  base: "./",
  plugins: [
    {
      name: "serverjs-typescript-source",
      enforce: "pre",
      resolveId(source, importer) {
        return serverjsTypeScriptSource(source, importer);
      },
    },
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
            const scheme =
              params.get("scheme") || (port === "443" ? "https" : "http");
            const fetchWithTimeout = async (url: string): Promise<string> => {
              const controller = new AbortController();
              const timeout = setTimeout(
                () => controller.abort(),
                hashLookupTimeoutMs,
              );
              const result = await fetch(url, {
                signal: controller.signal,
                agent: agentFor(url),
              })
                .then((r) => (r.ok ? r.text() : ""))
                .catch((e) => {
                  console.error(`Error fetching cert hash from ${url}:`, e);
                  return "";
                })
                .finally(() => clearTimeout(timeout));
              return result.trim();
            };

            let hash = "";
            if (isLocalDev && hashProviderUrl) {
              hash = await fetchWithTimeout(hashProviderUrl);
            }
            if (!hash && ip && port) {
              hash = await fetchWithTimeout(`${scheme}://${ip}:${port}/hash`);
            }

            if (!hash) {
              res.statusCode = 504;
              res.end("");
              return;
            }
            res.end(hash);
            return;
          }
          if (req.url?.startsWith("/api/playercount")) {
            if (!playerCountUrl) {
              res.end(JSON.stringify({ count: 0 }));
              return;
            }
            const playerCount = await fetch(playerCountUrl, {
              agent: agentFor(playerCountUrl),
            })
              .then((r) => r.json())
              .catch((e) => {
                console.error("Error fetching player count:", e);
                return { count: isLocalDev ? 0 : -1 };
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
    dedupe: [
      "@babylonjs/addons",
      "@babylonjs/core",
      "@babylonjs/inspector",
      "@babylonjs/loaders",
      "@babylonjs/materials",
      "@babylonjs/serializers",
    ],
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
      "@eqmessage": path.resolve(__dirname, "src/Game/Net/messages.ts"),
      "@@opcode": path.resolve(__dirname, "src/Game/Net/opcodes.ts"),
      "@ui": path.resolve(__dirname, "src/UI"),
      "@": path.resolve(__dirname, "src"),
      "@bjs": path.resolve(__dirname, "src/bjs/index.ts"),
    },
  },
  optimizeDeps: {
    exclude: isLocalDev
      ? ["@babylonjs/havok", "@sqlite.org/sqlite-wasm", "sage-core"]
      : ["@babylonjs/havok", "@sqlite.org/sqlite-wasm"],
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
