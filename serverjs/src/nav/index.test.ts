import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { readEnv } from "../config/env.js";
import { createLogger } from "../shared/logger.js";
import { NavService, type NavPoint } from "./index.js";

const meshDir = fileURLToPath(
  new URL("../../../server/maps", import.meta.url),
);
const worldPackageDir = fileURLToPath(
  new URL("../../../client/public/eqrequiem/worlds", import.meta.url),
);
const start: NavPoint = {
  x: 206.90625,
  y: -0.443756103515625,
  z: -741.1624755859375,
};
const end: NavPoint = {
  x: 210.1062469482422,
  y: -8.443756103515625,
  z: -686.762451171875,
};

describe("zone-shared navigation workers", () => {
  it("uses one Qeynos mesh worker for path requests from multiple instances", async () => {
    const service = new NavService(
      readEnv({
        NAV_MESH_DIR: meshDir,
        WORLD_PACKAGE_DIR: worldPackageDir,
      }),
      createLogger("error"),
    );
    await service.start();
    try {
      const [first, second] = await Promise.all([
        service.findPath({
          zoneKey: "qeynos2",
          zoneId: 1,
          instanceId: 0,
          start,
          end,
        }),
        service.findPath({
          zoneKey: "QEYNOS2",
          zoneId: 1,
          instanceId: 9,
          start,
          end,
        }),
      ]);

      assert.equal(first.instanceId, 0);
      assert.equal(second.instanceId, 9);
      assert.ok(first.path.length >= 2);
      assert.ok(Math.abs(first.path[0]!.x - start.x) < 1e-4);
      const [status] = service.listZones();
      assert.deepEqual(status, {
        zoneKey: "qeynos2",
        tileCount: 32,
        pendingQueries: 0,
        layoutHash: status!.layoutHash,
      });
      assert.match(status!.layoutHash, /^[0-9a-f]{8}$/);
    } finally {
      await service.stop();
    }
  });

  it("does not allow a zone key to escape the configured mesh directory", async () => {
    const service = new NavService(
      readEnv({
        NAV_MESH_DIR: meshDir,
        WORLD_PACKAGE_DIR: worldPackageDir,
      }),
      createLogger("error"),
    );
    await service.start();
    try {
      await assert.rejects(
        service.findPath({
          zoneKey: "../qeynos2",
          zoneId: 1,
          instanceId: 0,
          start,
          end,
        }),
        /invalid navigation path characters/,
      );
    } finally {
      await service.stop();
    }
  });
});
