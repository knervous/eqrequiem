# ServerJS rules

## The two runtimes

Gameplay runs in two places, and both are real:

| | Offline / embedded | Live server |
|---|---|---|
| Entry | `backend/embedded-game-backend.ts` | `zone/index.ts` (`ZoneService`) |
| Simulation | `zone/embedded-zone-runtime.ts`, in-process | `zone/zone-worker.ts`, worker thread |
| Database | one SQLite file, attached content DB | separate runtime and content backends |
| Transport | Worker/offline adapter | WebTransport via `GatewayService` |

The offline backend is not a demo or a mock. It is how the client is developed, how most
manual testing happens, and how a single-player session runs. A rule that only holds on
the live server is a rule that is not being tested.

## The rule

**Anything that decides what happens in the game must be written once and called by both
runtimes. Each runtime supplies only its own transport and threading.**

Concretely, when you add server logic, ask which of the two it is:

- **A gameplay decision** — what a kill is worth, which quests load in a zone, whether a
  note is accepted, what an item grant produces, how credit is split, what a world
  condition means. This goes in a shared module. Today those are `zone/quest-runtime.ts`
  (shard construction and gameplay rules), `zone/quest-effect-applier.ts` (committing
  persistent effects), `progression/character-progress-repository.ts` (every write a
  character owns), and `zone/quest-*.ts` (the engine itself). Add to these or create a
  sibling; do not add it to a backend. Shared application/runtime entry points now also
  include `zone/character-application-service.ts`, `zone/gm-command-service.ts`,
  `zone/zone-join-service.ts`, `zone/zone-runtime-projections.ts`,
  `persist/character-roster-service.ts`, and `persist/zone-session-service.ts`.
- **A delivery concern** — encoding a packet, posting to a worker, serializing writes per
  shard, routing an opcode. This belongs to the runtime and may differ.

If you find yourself writing the same SQL, the same formula, or the same validation in
both `backend/` and `zone/`, stop and extract it first. Duplicated gameplay logic does not
stay identical; it drifts silently and the offline path is where the drift is found last.

### Database boundary

`persist/game-database.ts` is the repository composition root for both runtimes. It owns
the runtime/content backend topology and attached-content prefix, and it rebinds every
repository consistently when the write scheduler supplies a transaction.

- `backend/embedded-game-backend.ts` and `zone/index.ts` must not issue SQL directly.
  They are transport/threading harnesses and call repositories from `GameDatabase`.
- Runtime adapters call `zone/character-application-service.ts` for character mutations,
  `zone/zone-join-service.ts` for zone-entry projections/checkpoints, and
  `persist/character-roster-service.ts` for account/character-select workflows. Do not
  rebuild those workflows in an adapter.
- GM parsing/effects, merchant eligibility, quest ingress/death credit, client/runtime
  projections, ability results/loadouts, and zone-session resolution also have shared
  owners. Backend switches only translate their returned effects into packets/events.
- Put shared read projections in `persist/game-data-repository.ts` and character-owned
  mutations in `persist/repository.ts` or the existing focused progression/merchant
  repositories.
- `backend/embedded-database-harness.ts` is the narrow exception: it owns SQLite schema
  compatibility, content attachment, and fixture seeding, not gameplay data access.
- New repository statements should use the shared Drizzle compilation boundary so
  SQLite, MySQL, Postgres, and browser OPFS do not grow separate query implementations;
  migrate older raw repository statements mechanically when touching them.

### Checklist for a new server feature

1. Put the decision in a shared module with a name that says what it decides.
2. Give it a pure or repository-only signature — no `BackendEvent`, no `postMessage`, no
   `Logger`. Both runtimes must be able to call it.
3. Wire *both* call sites in the same change. A feature that works offline and not live
   (or the reverse) is unfinished, not staged.
4. Cover it with a test that exercises the shared function directly, plus at least one
   end-to-end test through `embedded-game-backend.test.ts` — that suite runs the real
   SQLite schema and is the cheapest proof the whole path works.
5. If it persists anything, add the migration to `db/canonical-schema.ts` and extend
   `db/canonical-schema.test.ts`. Never mutate an existing migration.

### Things that are easy to get wrong here

- **Content database.** The live server and the offline backend both read content, but
  offline *attaches* a prebuilt SQLite (`db:content:inflate`) whose schema is frozen at
  export time. Content migrations do not run against it. Any new content table must be
  optional at runtime — query it defensively and fall back — until content is re-exported.
  `level_experience_curve` is the worked example.
- **Character identity.** Offline resolves a character by name in places; the live path
  carries `characterId`. Shared functions take `characterId`. Resolve names at the edge.
- **Ticking.** The worker has a real tick loop; the offline backend does not. Anything
  time-based must use wall-clock time (`zone/world-clock.ts`, `QuestManager`'s injected
  clock), never a tick count, or it will behave differently offline — or, worse, only
  advance while the player happens to be moving.
- **Effects, not I/O.** Quest handlers stay synchronous and emit effects. The applier is
  the only thing that writes. Do not add an `await` inside a handler path.

## Quest content

Authored quests live in `zone/quests/zones/<zone>/`. `quest-zone-registry.ts` generates
the manifest and binding index from that code — never hand-maintain a parallel table.

- Give every authored quest its own scope (`quests.quest("key", { revision })`), and bump
  `revision` with a `migrate` whenever persisted state changes shape.
- `oncePerPlayer` **requires** `onceKey`. Without one the claim is keyed by registration
  order and inserting a handler above it silently re-fires or suppresses the content.
  `validateQuestContent()` fails the build for this; keep it that way.
- Idempotency is the author's responsibility only in that they should use the idempotent
  API: `awardXpOnce`, `learn`, `discover`, `grantOnce`. All of them return whether they
  actually did something.
- Run `npm test` — `quest-manifest.test.ts` statically checks every zone's content for
  undefined regions, unclaimable one-time handlers, duplicate keys and impossible level
  bands. All of those are silent at runtime.
