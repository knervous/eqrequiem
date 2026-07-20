# Babylon.js Playground: Shado VAT showcase

The Vite sandbox and online Babylon Playground call the same exported
`createShadoVatShowcase` runtime and `createShadoVatShowcaseUi` overlay from
`@knervous/shado`. The Playground is intentionally a readable integration
example rather than a blank demo launcher: it shows normal Babylon camera,
lighting, environment and font setup; Shado asset/worker configuration;
controller creation; MSDF nameplate integration; UI binding; public controller
commands; and lifecycle cleanup. `playground-ui.ts` contains the small host UI
adapter so the scene code stays focused on Babylon and Shado concepts.

The five Playground modules each have one job:

1. `index.ts` — standard Babylon scene, camera, lights, and entrypoint.
2. `showcase-actor.ts` — packed `@gpuStruct` actor fields, friendly
   `@shadoPublish` controls, initialization, and the container class.
3. `showcase-shader.ts` — a typed `ShadoInstanceGLSLHooks` strategy. It extends
   the generated VAT material at stable insertion points; there is no shader
   source search-and-replace.
4. `showcase-app.ts` — assets, worker, font/nameplates, actor/container class
   injection, controller API, and lifecycle.
5. `playground-ui.ts` — the small adapter around the reusable overlay.

The Shado showcase vendors the original compressed source GLBs under
`sandbox/public/shado/eq-demo/models`. It includes male and female models for
the 13 complete playable race pairs available in the decoded archive (Human
through Iksar), plus Wolf, Gnoll, Goblin, and Skeleton NPCs. Each `.glb.gz` is
downloaded, decompressed, imported, and dual-quaternion VAT-baked on demand.
The POC selects a broad but bounded animation library per skeleton while
keeping unsafe ambient actions out of the initial random playback set.
Up to three models bake concurrently in independent NullEngine workers, so the
visible Babylon scene never shares its animation evaluator with a VAT job.

The compact model picker also exposes Babylon's canonical Playground samples
on demand, using the formats and URLs in which Babylon publishes them:
`Dude/dude.babylon`, `HVGirl.glb`, and `BrainStem/BrainStem.gltf`. This exercises
Shado's VAT path against legacy Babylon JSON, binary glTF, and multi-file glTF
without maintaining showcase-only aliases or copies.

The worker path samples Babylon poses in short yielding batches, then transfers
the skin matrices to an AssemblyScript/WebAssembly kernel. Matrix decomposition,
quaternion normalization, dual-quaternion packing, atlas layout, and float16
conversion happen off the UI thread. Known-rigid showcase skeletons skip the old
full-animation scale-detection pre-pass, avoiding a duplicate evaluation of
every frame. `buildFromScene()` remains the synchronous preprocessing path;
`buildFromSceneAsync()` and `DQBuildOpts.execution = "worker"` expose the new
runtime capability with a main-thread WASM fallback.

For the online Playground, enable npm imports, make `index.ts` the entrypoint,
and add the other four modules above. It requires `@knervous/shado@1.0.4` or
newer and uses the Playground's global `BABYLON` namespace while Shado shares
its generated shader stores with that host runtime. Publish the package and
push the vendored model directory before testing the raw GitHub URLs. Pin
`main` in `RAW_ROOT` to a commit SHA for the public forum announcement.

The overlay reports bake progress, failures, instances, visible actors, and
FPS. It can load PC/NPC rosters independently, add/remove actors, shuffle their
animation clips, and toggle MSDF names. Names come from
`fantasy-name-generator`; canonical Babylon samples use `ModelName N`. Playable
EQ actors select one complete Requiem texture-array family at a time: original
armorless art, leather, chain, or plate. The selected-instance UI consumes the
actor's `@shadoPublish` metadata for armor and the `r_point` main-hand socket.

Click any rendered instance to populate the Selected Instance editor. Transform,
quaternion, armor, weapon, tint, animation timing, nameplate, and visibility
fields update the packed actor live. Hold Shift and drag on the terrain to move
the selected instance in world space without orbiting the camera.

The drop panel below the overlay accepts one or more self-contained animated
GLB 2.0 files. Each file must contain a skinned mesh, skeleton, and at least one
animation group. Shado selects up to twelve useful clips, runs the same
headless worker/WASM VAT pipeline used by the built-in roster, auto-fits the
model to the scene scale, and adds it to the model pill list and live crowd.
