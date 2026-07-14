# Zone runtime slice

The zone worker owns orchestration and class handles; one Shado-formatted WASM arena
owns dense PC/NPC simulation planes.

Current tick slice:

1. Attach routed client sessions to one owned zone instance.
2. Send ordered `NewZone`, `PlayerProfile`, and initial spawn bootstrap packets.
3. Consume bounded inbound packets and explicit client join/leave messages.
4. Decode Shado fixed packets or bounded sidecars in opcode handlers.
5. Mutate entities through `Entity`, `PC`, and `NPC` typed handles over that arena.
6. Run the precompiled NPC steering/integration reducer against the same plane pointers.
7. Compact its dirty-index queue into a versioned world-state envelope containing
   the generated Shado SoA planes and, when needed, a UTF-8 sidecar.
8. Transfer that packet to the transport thread without object decoding.

`serverjs/assembly/zone-simulation.ts` is the checked-in kernel source. Shado invokes
AssemblyScript only at build time and emits debug and release artifacts under
`serverjs/src/zone/wasm/`; ServerJS never compiles a reducer at runtime.

The arena's public prefix is itself a fixed-capacity `RenderSnapshotNet` batch. That
range can be handed to a full-state sync or GPU consumer without decoding or copying.
Bootstrap and AOI-enter packets use the same public layout as tick deltas; names and
model keys are referenced by byte offset into the packet sidecar.
Private target, speed, flags, combat, aggro, and dirty planes follow the public range
and never cross the render protocol boundary. Dirty incremental publication performs
one intentional projection into the final transferable packet.

This is the movement baseline from the architecture spec. Spatial bins, staggered
perception, sparse threat tables, dirty aggro selection, route requests, and combat
timers should be added as separate homogeneous kernel phases in that order.
