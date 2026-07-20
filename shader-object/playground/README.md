# Babylon.js Playground: Shado VAT showcase

The Vite sandbox and online Babylon Playground now call the same exported
`createEqShowcase` runtime and `createEqShowcaseUi` overlay from `@knervous/shado`.
The two small files in this directory are the TypeScript Playground entry point
and an optional UI re-export for a multi-file Playground.

The Shado showcase vendors the original compressed source GLBs under
`sandbox/public/shado/eq-demo/models`. It includes male and female models for
the 13 complete playable race pairs available in the decoded archive (Human
through Iksar), plus Wolf, Gnoll, Goblin, and Skeleton NPCs. Each `.glb.gz` is
downloaded, decompressed, imported, and dual-quaternion VAT-baked on demand.
The POC bakes eight representative Requiem animation codes per skeleton (pose,
idle variants, walk, run, cheer, wave, and attack) rather than all 72 legacy
emotes, keeping the interactive startup bounded.
Models load sequentially so Babylon's animation evaluator is never shared by
two simultaneous VAT jobs.

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

For the online Playground, enable npm imports and paste
`babylon-playground.ts`. It uses the Playground's global `BABYLON` namespace,
while Shado mirrors its generated shader stores into that host
namespace. Publish the package and push the vendored model directory before
testing the raw GitHub URLs. Pin `main` in `RAW_MODELS` to a commit SHA for the
public forum announcement.

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
