# AssemblyScript ownership

The kernels in this directory belong to eqrequiem. They are compiled by the
`@knervous/shado` CLI using `../shado.config.mjs`; Shado does not own or
copy these sources. Imports for generated/shared AssemblyScript should remain
relative to the kernel and be declared through that config when generation is
required.

`npm run wasm:build` emits explicit debug and release binaries under
`src/zone/wasm/`.
