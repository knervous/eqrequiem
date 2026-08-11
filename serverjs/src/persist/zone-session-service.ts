import { DEMO_START } from "../content/demo-start.js";
import type { GameDatabase } from "./game-database.js";

export interface ZoneSessionResolution {
  readonly valid: boolean;
  readonly zoneId: number | null;
  readonly instanceId: number;
}

/** Resolves and validates the zone identity chosen at character entry. */
export class ZoneSessionService {
  constructor(private readonly database: GameDatabase) {}

  async resolve(
    requestedZone: number | string,
    instanceId: number,
    demoStartPending: boolean,
  ): Promise<ZoneSessionResolution> {
    const demoZoneId = demoStartPending
      ? await this.database.data.resolveZoneId(DEMO_START.zoneId)
      : null;
    const zoneId = demoZoneId
      ?? await this.database.data.resolveZoneId(requestedZone);
    return {
      valid: zoneId !== null,
      zoneId,
      instanceId,
    };
  }
}
