# Database direction

ServerJS supports SQLite for local/browser-adjacent development and PostgreSQL for hosted deployments. `DatabaseBackend` is the driver boundary; the canonical schema is managed by small forward-only migrations in `src/db/canonical-schema.ts`.

Drizzle and the generated MySQL schemas were removed. The server does not open MySQL connections at runtime. `mysql2` remains only for the one-way hydration tool.

## Local hydration

From `serverjs`:

```sh
npm run db:hydrate:mysql
npm run db:schema:apply
npm run db:promote:imported
npm run db:hydrate:verify
```

The hydrator streams every table in `game_content` and `game_runtime` to temporary SQLite files and atomically replaces the destinations only after a successful import. Environment variables can override the MySQL connection and destination paths.

Imported tables preserve the source data as migration inputs, but active repositories only target canonical tables. `promote-imported-data` currently maps zones, NPC archetypes, spawn groups/points, accounts, characters, positions, and inventory into the forward schema. Future domain migrations can promote remaining data and then delete obsolete imported tables without compatibility shims.

Canonical migrations run automatically when `DbService` or the persistence repository starts.
