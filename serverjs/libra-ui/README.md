# Libra UI

React + TypeScript + shadcn-style UI shell for content editing (`game_content`) via `/libra` APIs.

## Run

From the repository root, run:

```bash
npm run libra:dev
```

This starts both Vite and a standalone Libra API on port 8082. The API edits
`serverjs/data/content-db.sqlite` directly and keeps audit records in the separate
`serverjs/data/libra-runtime.sqlite`; it does not require the game backend.
Existing SQLite content is preserved across launches. To deliberately discard local
edits and restore the checked-in gzip, run `npm --prefix serverjs run db:content:inflate:force`.

Use `LIBRA_CONTENT_DATABASE_URL=sqlite:/absolute/path.sqlite` to edit another SQLite
content database, or `LIBRA_DEV_PORT` to move the API from port 8082.

## Backend Contract

Expected backend endpoints:

- `GET /libra/health`
- `GET /libra/meta/tables?db=content`
- `GET /libra/meta/columns?db=content&table=...`
- `GET /libra/data?db=content&table=...`
- `POST /libra/data?db=content&table=...`
- `PUT /libra/data?db=content&table=...`
- `DELETE /libra/data?db=content&table=...`
- `GET /libra/validate?db=content`

## Environment

Copy `.env.example` to `.env` and set values as needed.

By default, dev mode proxies `/libra/*` to `http://127.0.0.1:8082`. Shard and quest
controls require the full backend; content tables, zones, NPCs, validation, and CRUD
operate in standalone SQLite mode.

## Model viewer

Open `/models` to validate the installed Requiem character bundle through the
shared Shado/VAT rendering path. The development server serves the checked-in
`client/public/eqrequiem` assets. Set `VITE_REQUIEM_ASSET_BASE` only when the
runtime bundle is hosted elsewhere.

The current `hum` and `huf` entries are painted Hunyuan bodies on the shared
`humanoid_medium` rig. Libra uses their baked Shado mesh, painted runtime atlas,
and 27-clip VAT library: the reviewed CMU Idle/Walk/Run foundation plus the
retargeted original EQ HUM gameplay and social motions. The full-resolution PBR
GLBs retain the latest high-detail Hunyuan paint: HUM comes from
`grounded-fantasy-candidate/candidate-clean-final.glb`, while HUF projects the
v12 2048-square PBR maps onto the corrected shared rig. The flat
`texture-candidate` assets are retained only as rejected fallback history.
The installed HUM/HUF atlases remain 2048 square and use UASTC level 3 Basis
encoding; `basis/hum.meta.json` and `basis/huf.meta.json` record the source and
runtime hashes so the installer cannot silently fall back to the old 1024
default-ETC1S path.

Run the model contract tests from the repository root with:

```bash
npm run libra:model:test
```
