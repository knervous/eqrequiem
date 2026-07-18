# Babylon.js Playground example

`babylon-playground.ts` is a one-off online smoke test for Shader Object 1.0.
Paste it into the Babylon.js Playground TypeScript editor with npm imports
enabled and run it. The Playground supplies `BABYLON`, `engine`, and `canvas`
as globals; the example imports only `shader-object` from npm. It fetches the
packed Barbarian and Arachnid scenes and their float16/float32 DQ VAT artifacts
from this repository through `raw.githubusercontent.com`. The Arachnid texture
uses its verified upstream GitHub raw URL.

The example intentionally uses no local server and no EqRequiem API. It follows
the TypeScript Playground `Playground.CreateScene(engine, canvas)` class
contract and exposes a status object as `globalThis.shadoPlayground` for console
inspection. `CreateScene` returns immediately; packed assets finish loading in
the private asynchronous setup method.

The scene creates 30 uniquely named barbarians with eight armor tints and 16
named arachnids. Both groups use the sandbox's MSDF nameplate system. The
example enables Babylon's serialized-URL behavior and rewrites both serialized
Arachnid texture fields to the full upstream raw URL, so the Playground origin
is never used as an asset fallback.

Before publishing 1.0, an online npm resolver may still serve the latest 0.x
package. Publish `shader-object@1.0.0` first, or temporarily change the package
specifier to an available version while testing the raw assets.

For a reproducible demo, replace `main` in `RAW_ASSET_ROOT` with the commit SHA
containing the artifacts.
