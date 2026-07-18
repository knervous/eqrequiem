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

The current `hum` and `huf` entries are painted PBR manual candidates. Libra
uses their baked Shado mesh, VAT animation data, and painted runtime atlas; the
full-resolution PBR GLBs and normal/ORM maps remain under each source model's
`eqref` directory for material inspection.

Run the model contract tests from the repository root with:

```bash
npm run libra:model:test
```
