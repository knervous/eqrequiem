# Libra Backend Editor Bootstrap

## Scope

Bootstrap the "Libra" editing/tooling backend as a lightweight HTTP service inside `serverjs`.

Primary path is Libra REST (MySQL-backed) plus a dedicated React/TypeScript frontend shell in `libra-ui/`.

This phase prioritizes:
- Table discovery
- Column introspection
- Row browsing
- Controlled editing for content DB
- Runtime safety defaults

## Implemented in this bootstrap

- Service integrated into app lifecycle: `src/libra/index.ts`
- HTTP server on existing app HTTP bind (`HTTP_HOST`, `HTTP_PORT`)
- Optional API key auth (`x-libra-key`) via `LIBRA_API_KEY`
- Runtime read-only mode by default (`LIBRA_READONLY_RUNTIME=true`)
- CORS enabled for local tool UIs
- Audit log table bootstrapped in runtime DB (`libra_audit_log`)
- Table write allowlist enforcement (`LIBRA_WRITE_ALLOWLIST`)
- Validation endpoint with initial integrity checks
- Libra frontend shell: `libra-ui/` (shadcn-style UI primitives + section routing)

## Libra UI (Broad Strokes)

- `libra-ui/` is a dedicated React + TS app for content editing.
- Landing and high-level sections are scaffolded:
  - Overview
  - Content Editor (generic content-table CRUD)
  - Validation
  - Releases (placeholder for publish/pinning flow)
- Content editor currently uses dynamic metadata endpoints for broad coverage across large table counts.

### Endpoints

- `GET /libra`
  - Capability and route listing
- `GET /libra/health`
  - Basic health and DB target info
- `GET /libra/meta/tables?db=content|runtime`
  - Table list + row estimates
- `GET /libra/meta/columns?db=content|runtime&table=<table>`
  - Column schema info
- `GET /libra/validate?db=content|runtime`
  - Integrity checks for content/runtime tables
- `GET /libra/data?db=content|runtime&table=<table>&limit=<n>&offset=<n>`
  - Paged row reads
- `POST /libra/data?db=content&table=<table>`
  - Insert row (`{ "row": { ... } }`)
- `PUT /libra/data?db=content&table=<table>`
  - Primary-key update (`{ "row": { ... } }`)
- `DELETE /libra/data?db=content&table=<table>`
  - Primary-key delete (`{ "key": { ... } }`)

## Safety defaults

- Runtime write operations blocked unless `LIBRA_READONLY_RUNTIME=false`
- Writes blocked unless target table passes `LIBRA_WRITE_ALLOWLIST`
- SQL identifier validation for table/column names
- No dynamic raw SQL execution endpoint in bootstrap
- Page size capped by `LIBRA_MAX_PAGE_SIZE`
- Every mutation request emits an audit record with actor + request id + payload

## Environment knobs

- `LIBRA_ENABLED=true`
- `LIBRA_API_KEY=` (blank = no auth, local only)
- `LIBRA_READONLY_RUNTIME=true`
- `LIBRA_MAX_PAGE_SIZE=500`
- `LIBRA_WRITE_ALLOWLIST=*`
- `LIBRA_VALIDATION_MAX_ISSUES=250`

## Current validation checks

- Content:
  - `spawn2` orphan `spawngroupID`
  - `spawnentry` orphan `spawngroupID`
  - `loottable_entries` orphan `loottable_id`
  - `lootdrop_entries` orphan `lootdrop_id`
  - `loottable_entries` probability sum > 100
  - `lootdrop_entries` chance sum > 100
- Runtime:
  - `character_inventory` orphan `character_data`
  - `character_inventory` orphan `item_instances`

## Suggested next components

1. Add audit/event log table for every edit action (who/what/when/before/after).
2. Add approval workflow for content publish from release tag into promoted target.
3. Add table-level write allowlist and column-level guardrails.
4. Add semantic validators (spawn constraints, loot sanity, orphan checks).
5. Add runtime admin ops API (safe command queue, no direct mutable SQL).
