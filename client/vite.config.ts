import fs from "node:fs";
import * as http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import autoprefixer from "autoprefixer";
import * as https from "https";
import fetch from "node-fetch";
import tailwindcss from "tailwindcss";
import libraTailwindConfig from "../serverjs/libra-ui/tailwind.config";
import { babylonLiteVat2dPlugin } from "../shader-object/sandbox/vite/babylon-lite-vat-2d";

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
const libraUiRoot = path.resolve(__dirname, "../serverjs/libra-ui/src");
const sandboxRoot = path.resolve(__dirname, "../shader-object/sandbox/src");
const shaderObjectSourceRoot = path.resolve(__dirname, "../shader-object/src");
const shadoPublicRoot = path.resolve(
  __dirname,
  "../shader-object/sandbox/public/shado",
);
const clientRequire = createRequire(path.resolve(__dirname, "package.json"));
const clientDependencyImporter = path.resolve(__dirname, "src/main.tsx");
const clientBrowserDependencies = new Map([
  ["@knervous/shado", path.resolve(__dirname, "../shader-object/src/index.ts")],
  [
    "@knervous/shado/world",
    path.resolve(__dirname, "../shader-object/src/world/index.ts"),
  ],
  [
    "@knervous/shado/render",
    path.resolve(__dirname, "../shader-object/src/render/index.ts"),
  ],
  [
    "@knervous/shado/renderer",
    path.resolve(__dirname, "../shader-object/src/renderer/index.ts"),
  ],
  [
    "@knervous/shado/babylon",
    path.resolve(__dirname, "../shader-object/src/babylon/index.ts"),
  ],
  [
    "@knervous/shado/core",
    path.resolve(__dirname, "../shader-object/src/core/index.ts"),
  ],
  [
    "@knervous/shado/lite",
    path.resolve(__dirname, "../shader-object/src/lite/index.ts"),
  ],
  [
    "@knervous/shado/showcase",
    path.resolve(__dirname, "../shader-object/src/showcase/index.ts"),
  ],
  [
    "@knervous/shado/msdf",
    path.resolve(__dirname, "../shader-object/src/msdf/index.ts"),
  ],
  [
    "@knervous/shado/preprocess",
    path.resolve(__dirname, "../shader-object/src/preprocess/index.ts"),
  ],
  [
    "@knervous/shado/preprocess/runtime",
    path.resolve(__dirname, "../shader-object/src/preprocess/runtime.ts"),
  ],
  [
    "@babylonjs/core",
    path.resolve(__dirname, "src/bjs/core-runtime.ts"),
  ],
  [
    "@babylonjs/lite",
    path.resolve(__dirname, "node_modules/@babylonjs/lite/lib/index.js"),
  ],
  [
    "@sqlite.org/sqlite-wasm",
    path.resolve(__dirname, "node_modules/@sqlite.org/sqlite-wasm/dist/index.mjs"),
  ],
  [
    "@sqlite.org/sqlite-wasm/sqlite3.wasm",
    path.resolve(__dirname, "node_modules/@sqlite.org/sqlite-wasm/dist/sqlite3.wasm"),
  ],
  [
    "@recast-navigation/core",
    clientRequire.resolve("@recast-navigation/core"),
  ],
  ["drizzle-orm", path.resolve(__dirname, "node_modules/drizzle-orm/index.js")],
  [
    "drizzle-orm/mysql-core",
    path.resolve(__dirname, "node_modules/drizzle-orm/mysql-core/index.js"),
  ],
  [
    "drizzle-orm/pg-core",
    path.resolve(__dirname, "node_modules/drizzle-orm/pg-core/index.js"),
  ],
  [
    "drizzle-orm/sqlite-core",
    path.resolve(__dirname, "node_modules/drizzle-orm/sqlite-core/index.js"),
  ],
  [
    "maxrects-packer",
    path.resolve(__dirname, "node_modules/maxrects-packer/dist/maxrects-packer.mjs"),
  ],
]);

function isBareModuleImport(source: string): boolean {
  return (
    !source.startsWith(".") &&
    !source.startsWith("/") &&
    !source.startsWith("\0") &&
    !path.isAbsolute(source)
  );
}

function isSourceWithin(importer: string | undefined, root: string): boolean {
  const importerPath = importer?.replaceAll("\\", "/").split("?", 1)[0];
  const rootPath = root.replaceAll("\\", "/");
  return importerPath === rootPath || importerPath?.startsWith(`${rootPath}/`) === true;
}

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

function serverjsSourcePlugin(): Plugin {
  return {
    name: "serverjs-typescript-source",
    enforce: "pre" as const,
    async resolveId(source: string, importer?: string) {
      const clientDependency = clientBrowserDependencies.get(source);
      if (clientDependency) return clientDependency;
      const serverSource = serverjsTypeScriptSource(source, importer);
      if (serverSource) return serverSource;
      const isLinkedBrowserSource =
        isSourceWithin(importer, serverjsSourceRoot) ||
        isSourceWithin(importer, shaderObjectSourceRoot);
      if (
        !isBareModuleImport(source) ||
        !isLinkedBrowserSource
      ) {
        return null;
      }
      // The production host installs client/package.json only. Shado's linked
      // TypeScript and ServerJS-authored browser modules therefore need bare
      // imports resolved from the client graph, while Vite still owns ESM
      // conditions and CommonJS interop.
      return this.resolve(source, clientDependencyImporter, { skipSelf: true });
    },
  };
}

function resolveSourceModule(root: string, relativePath: string): string | null {
  const absolute = path.resolve(root, relativePath);
  for (const candidate of [
    absolute,
    `${absolute}.ts`,
    `${absolute}.tsx`,
    `${absolute}.js`,
    `${absolute}.jsx`,
    path.join(absolute, "index.ts"),
    path.join(absolute, "index.tsx"),
  ]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

function subappSourcePlugin(): Plugin {
  return {
    name: "requiem-subapp-source",
    enforce: "pre" as const,
    async resolveId(source: string, importer?: string) {
      const importerPath = importer?.replaceAll("\\", "/").split("?", 1)[0];
      const isLibra = importerPath?.startsWith(libraUiRoot.replaceAll("\\", "/"));
      const isSandbox = importerPath?.startsWith(
        sandboxRoot.replaceAll("\\", "/"),
      );
      if (!isLibra && !isSandbox) return null;

      if (isLibra && source.startsWith("@libra/")) {
        return resolveSourceModule(libraUiRoot, source.slice(7));
      }
      if (source === "@bjs") {
        return path.resolve(__dirname, "src/bjs/index.ts");
      }
      if (source.startsWith("@game/")) {
        return resolveSourceModule(
          path.resolve(__dirname, "src/Game"),
          source.slice(6),
        );
      }
      if (source.startsWith("@requiem/")) {
        return resolveSourceModule(
          path.resolve(__dirname, "src"),
          source.slice(9),
        );
      }

      if (isLibra && source === "@babylonjs/core") {
        return path.resolve(__dirname, "src/bjs/core-runtime.ts");
      }
      if (isSandbox && source === "@babylonjs/core") {
        return clientRequire.resolve(source);
      }
      const shadoSource = clientBrowserDependencies.get(source);
      if (shadoSource) return shadoSource;

      if (!isBareModuleImport(source)) return null;
      // CI installs only client/package.json. Resolve from a client-owned
      // importer while retaining Vite's import conditions, dependency
      // optimization, and CommonJS interop.
      return this.resolve(source, clientDependencyImporter, { skipSelf: true });
    },
  };
}

function subappStaticAssetsPlugin(): Plugin {
  return {
    name: "requiem-subapp-static-assets",
    async writeBundle(outputOptions: { dir?: string }) {
      const outputRoot = path.resolve(
        __dirname,
        outputOptions.dir ?? "dist",
      );
      await fs.promises.cp(shadoPublicRoot, path.join(outputRoot, "shado"), {
        recursive: true,
        force: true,
      });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [
    subappSourcePlugin(),
    serverjsSourcePlugin(),
    babylonLiteVat2dPlugin,
    subappStaticAssetsPlugin(),
    react(),
    {
      name: "requiem-dev-server",
      configureServer: ({ middlewares }) => {
        middlewares.use(async (req, res, next) => {
          if (req.method === "GET" && req.url) {
            const requestUrl = new URL(req.url, "https://localhost");
            const subappEntry = requestUrl.pathname.startsWith("/apps/libra/")
              ? "/apps/libra/index.html"
              : requestUrl.pathname.startsWith("/apps/sandbox/")
                ? "/apps/sandbox/index.html"
                : null;
            if (subappEntry && !path.extname(requestUrl.pathname)) {
              req.url = `${subappEntry}${requestUrl.search}`;
            }
          }
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
          if (req.url?.startsWith("/shado/")) {
            const relativePath = decodeURIComponent(
              req.url.split(/[?#]/, 1)[0].slice("/shado/".length),
            ).replace(/^\/+/, "");
            const filePath = path.resolve(shadoPublicRoot, relativePath);
            if (
              !filePath.startsWith(`${shadoPublicRoot}${path.sep}`) ||
              !relativePath
            ) {
              next();
              return;
            }
            try {
              const bytes = await fs.promises.readFile(filePath);
              res.statusCode = 200;
              res.setHeader(
                "Content-Type",
                filePath.endsWith(".js")
                  ? "text/javascript"
                  : filePath.endsWith(".json")
                    ? "application/json"
                    : filePath.endsWith(".glb")
                      ? "model/gltf-binary"
                      : filePath.endsWith(".gz")
                        ? "application/gzip"
                        : "application/octet-stream",
              );
              res.setHeader("Content-Length", bytes.byteLength);
              res.end(bytes);
              return;
            } catch {
              next();
              return;
            }
          }
          res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
          res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
          next();
        });
      },
    },
  ],
  css: {
    postcss: {
      plugins: [
        tailwindcss({
          ...libraTailwindConfig,
          content: [
            path.resolve(__dirname, "../serverjs/libra-ui/index.html"),
            path.resolve(__dirname, "../serverjs/libra-ui/src/**/*.{ts,tsx}"),
          ],
        }),
        autoprefixer(),
      ],
    },
  },
  resolve: {
    // This repository still contains some legacy co-located JavaScript emits.
    // Prefer authored TypeScript for extensionless imports so stale emits cannot
    // silently replace newer class implementations at runtime.
    extensions: [".ts", ".tsx", ".mts", ".mjs", ".js", ".jsx", ".json"],
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
      "@game": path.resolve(__dirname, "src/Game"),
      "@eqmessage": path.resolve(__dirname, "src/Game/Net/messages.ts"),
      "@@opcode": path.resolve(__dirname, "src/Game/Net/opcodes.ts"),
      "@ui": path.resolve(__dirname, "src/UI"),
      "@libra": path.resolve(__dirname, "../serverjs/libra-ui/src"),
      "@requiem-subapp/libra": path.resolve(
        __dirname,
        "../serverjs/libra-ui/src/requiem-entry.ts",
      ),
      "@requiem-subapp/sandbox": path.resolve(
        __dirname,
        "../shader-object/sandbox/src/requiem-entry.ts",
      ),
      "@": path.resolve(__dirname, "src"),
      "@bjs": path.resolve(__dirname, "src/bjs/index.ts"),
    },
  },
  optimizeDeps: {
    include: ["@babylonjs/core"],
    exclude: ["@babylonjs/havok", "@sqlite.org/sqlite-wasm"],
  },
  build: {
    target: "chrome90",
    rolldownOptions: {
      input: {
        requiem: path.resolve(__dirname, "index.html"),
        libra: path.resolve(__dirname, "apps/libra/index.html"),
        sandbox: path.resolve(__dirname, "apps/sandbox/index.html"),
        fx: path.resolve(__dirname, "fx/index.html"),
      },
      output: {
        codeSplitting: {
          groups: [
            {
              name: "babylon-full",
              test: /node_modules[\\/]@babylonjs[\\/]core[\\/]/,
              priority: 20,
              includeDependenciesRecursively: false,
            },
            {
              name: "babylon-loaders",
              test: /node_modules[\\/]@babylonjs[\\/]loaders[\\/]/,
              priority: 15,
              includeDependenciesRecursively: false,
            },
          ],
        },
      },
    },
    commonjsOptions: {
      requireReturnsDefault: "preferred",
      transformMixedEsModules: true,
    },
  },
  worker: {
    format: "es",
    // Worker bundles have their own plugin pipeline. Vercel installs only the
    // client package, so repeat the ServerJS-source resolver there instead of
    // falling back to a nonexistent serverjs/node_modules directory.
    plugins: () => [serverjsSourcePlugin()],
  },
  server: {
    https: process.env.VITE_LOCAL_HTTP_QA === "true"
      ? undefined
      : {
        key: fs.readFileSync("localhost.key"),
        cert: fs.readFileSync("localhost.crt"),
      },
    port: 3500,
    proxy: {
      "^/libra(?:/|$)": {
        target:
          process.env.VITE_LIBRA_PROXY_TARGET ?? "http://127.0.0.1:8082",
        changeOrigin: true,
      },
    },
  },
});
