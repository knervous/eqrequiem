import { readFile } from "node:fs/promises";

import { ZoneSimulationKernel } from "./zone-kernel.js";

export type ZoneKernelBuild = "debug" | "release";

export async function loadZoneSimulationKernel(
  build: ZoneKernelBuild = process.env.NODE_ENV === "production"
    ? "release"
    : "debug",
): Promise<ZoneSimulationKernel> {
  const bytes = await readFile(
    new URL(`./wasm/zone-simulation.${build}.wasm`, import.meta.url),
  );
  return ZoneSimulationKernel.instantiate(bytes);
}
