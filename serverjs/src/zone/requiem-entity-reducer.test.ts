import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

interface ReducerExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  alloc(bytes: number): number;
  frustumMarkAoS(
    base: number,
    planes: number,
    radius: number,
    cameraX: number,
    cameraY: number,
    cameraZ: number,
    maxDistance: number,
  ): void;
}

for (const build of ["debug", "release"] as const) {
  describe(`precompiled common entity reducer (${build})`, () => {
    it("uses the Requiem actor ABI to mark and compact visible entities", async () => {
      const bytes = await readFile(
        new URL(`../../../common/wasm/requiem-entity-reducer.${build}.wasm`, import.meta.url),
      );
      const instance = await WebAssembly.instantiate(bytes, {
        env: { abort(): never { throw new Error("Reducer aborted"); } },
      });
      const reducer = instance.instance.exports as ReducerExports;
      const base = reducer.alloc(16 + 96 + 256);
      const planes = base + 16;
      const actors = planes + 96;
      const view = new DataView(reducer.memory.buffer);
      view.setUint32(base + 4, actors, true);
      view.setUint32(base + 8, 2, true);

      // An axis-aligned +/-10 box represented as inward-facing frustum planes.
      const values = [
        1, 0, 0, 10, -1, 0, 0, 10,
        0, 1, 0, 10, 0, -1, 0, 10,
        0, 0, 1, 10, 0, 0, -1, 10,
      ];
      values.forEach((value, index) => view.setFloat32(planes + index * 4, value, true));
      setActor(view, actors, 0, 0, 0, 1);
      setActor(view, actors + 128, 100, 0, 0, 1);

      reducer.frustumMarkAoS(base, planes, 1, 0, 0, 0, 0);

      assert.equal(view.getUint32(base, true), 1);
      assert.equal(view.getInt32(actors + 48, true), 0);
      assert.equal(view.getInt32(actors + 96, true), 1);
      assert.equal(view.getInt32(actors + 128 + 96, true), 0);
    });
  });
}

function setActor(
  view: DataView,
  offset: number,
  x: number,
  y: number,
  z: number,
  scale: number,
): void {
  view.setFloat32(offset, x, true);
  view.setFloat32(offset + 4, y, true);
  view.setFloat32(offset + 8, z, true);
  view.setFloat32(offset + 12, scale, true);
}
