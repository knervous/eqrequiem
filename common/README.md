# Common runtime kernels

EQRequiem owns the AssemblyScript sources in `common/assembly`. Shado is the
build-time compiler frontend only; neither the browser nor ServerJS loads
AssemblyScript or Binaryen at runtime.

Run `npm run wasm:build` from the repository root after changing a kernel or
its packed ABI. Debug and release artifacts are checked in under `common/wasm`.

`requiem-entity-reducer` is shared by every client model pool. Its ABI matches
`RequiemEntityActor`, and client startup validates the relevant offsets before
instantiating the precompiled artifact.
