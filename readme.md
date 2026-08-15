# EQ: Requiem

> [!IMPORTANT]
> **This repository is a read-only historical archive.** Active development no longer happens here, and issues, pull requests, releases, and support are not being accepted. It remains public to preserve provenance and a technical record—not as permission to reuse or republish the project. Because public visibility had been mistaken for permission to reuse the work, the current repository-level material is now provided under the restricted reference license in [LICENSE](LICENSE).

EQ: Requiem was an experiment in bringing an EverQuest-style multiplayer world to the browser with Babylon.js, React, WebTransport, WebAssembly, and Go/TypeScript services. This snapshot captures several generations of that work, including both the later TypeScript server and the earlier Go backend.

The instructions below are retained for historical study. They are best-effort notes for this final public snapshot; external services and archived assets may disappear, and no maintenance or setup support is provided.

## License

Copyright © 2026 Paul Johnson. All rights reserved.

You may clone and run an unmodified copy locally only for personal, non-commercial evaluation and historical study. Modification, redistribution, public deployment, commercial use, incorporation into another project, and use for training or improving machine-learning models are not permitted without prior written permission. See [LICENSE](LICENSE) for the complete terms.

This change does not retroactively alter rights already granted with earlier revisions. Third-party material and components carrying their own license remain governed by those terms; in particular, `shader-object/` retains its separate historical MIT license.

## Repository structure

| Path | Historical purpose |
| --- | --- |
| `client/` | React and TypeScript browser client, Babylon.js renderer, Vite applications, offline/local simulation worker, content assets, and asset-processing scripts. |
| `serverjs/` | Later TypeScript backend: WebTransport gateway, gameplay simulation, SQLite/MySQL/PostgreSQL adapters, quests, and the Libra content tools. |
| `server/` | Earlier Go backend, daemon/import utilities, MySQL-era configuration, maps, and quest runtime. |
| `common/` | Shared AssemblyScript kernels and checked-in WebAssembly artifacts used by the browser and server paths. |
| `shader-object/` | Shado packed GPU-data library, preprocessors, AssemblyScript tooling, tests, benchmarks, playgrounds, and Babylon.js sandboxes. |
| `docs/` | Renderer and Shado design notes. Additional architectural notes remain at the repository root. |
| `.github/workflows/` | CI configuration from the active-development period; it is retained as history and is not maintained. |

The snapshot is not a clean monorepo release. Some scripts describe migration or content-production workflows, some generated artifacts are checked in, and the Go and TypeScript servers represent different eras rather than two required halves of one deployment.

## Historical local development

### Prerequisites

- Node.js `24.18.0` (recorded in `.node-version`) and npm.
- A recent Chromium-based browser for WebGPU/WebTransport paths.
- OpenSSL when regenerating local WebTransport certificates.
- Go 1.24 and MySQL only when studying the legacy `server/` implementation.

Install only the package trees needed for the path you are studying:

```sh
npm ci --prefix shader-object
npm ci --prefix serverjs
npm ci --prefix client
```

The root package contains repository-level tooling. Install it separately with `npm ci` if you need those scripts.

### Browser client with the local/offline simulation

The smallest reproducible path does not require either server. From the repository root:

```sh
cd client
npm ci
VITE_LOCAL_BACKEND=true npm start
```

Open `https://localhost:3500/`. The snapshot includes a development certificate, so the browser may require a one-time trust exception. `?backend=local` selects the browser worker explicitly, while `?offline=true` enters Offline Mode immediately.

Useful checks retained in the snapshot include:

```sh
npm run typecheck
npm run validate
npm run build
```

### TypeScript server and browser client

The later full-stack path uses SQLite by default. In separate terminals from the repository root:

```sh
cd serverjs
npm ci
WT_PORT=4443 npm run dev
```

```sh
cd client
npm ci
VITE_WT_PORT=4443 VITE_HASH_PROVIDER_URL=http://localhost:8080/hash npm start
```

Using port `4443` avoids requiring elevated privileges for the default WebTransport port `443`. Server settings are documented in `serverjs/.env.example`; the process reads environment variables directly rather than loading that file automatically. To regenerate and trust the development certificate on macOS:

```sh
cd serverjs
npm run cert:dev:generate
npm run cert:dev:trust:mac
```

The standalone Libra content editor can be started with `npm --prefix serverjs run libra:dev`.

### Legacy Go server

The earlier implementation lives in `server/` and depended on Go 1.24, MySQL, local TLS keys, and Discord application credentials. Its historical bootstrap was:

1. Import the archived `eqgo` MySQL dump from `https://eqrequiem.blob.core.windows.net/dev/eqgo.sql.zip`.
2. Copy `server/internal/config/eqgo_config_template.json` to `eqgo_config.json` and fill in the local database settings.
3. Generate `server/internal/config/key.pem` and provide the expected `discord.txt` credential file.
4. Run `make s` or `go run ./cmd/server` from `server/`.

Those external inputs are not guaranteed to remain available. Do not use real production credentials with this archived code.

## Historical documentation

- `requiem-wasm-simulation-architecture.md` describes the shared simulation direction.
- `backend.md` and `backend-checklist.md` record backend migration decisions.
- `common/README.md` explains the shared runtime kernels.
- `shader-object/README.md` documents the separately licensed Shado package.

The commit history is the authoritative record of how the project evolved.
