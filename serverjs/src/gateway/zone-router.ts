import type { InboundPacket } from '../protocol/index.js';
import type { Logger } from '../shared/logger.js';

export interface ZoneWorkerRoute {
  zoneId: number;
  instanceId: number;
  workerId: string;
}

export interface WorldRoutingResult {
  forwardToZone: boolean;
  zoneId: number;
  instanceId: number;
  characterName?: string | null;
}

export interface RouterDependencies {
  handleWorldPacket(packet: InboundPacket): WorldRoutingResult;
  handleZonePacket(packet: InboundPacket, zoneId: number, instanceId: number, characterName?: string | null): void;
}

export class ZoneRouter {
  private readonly routes = new Map<number, ZoneWorkerRoute>();

  constructor(
    private readonly logger: Logger,
    private readonly deps: RouterDependencies,
  ) {}

  setRoute(sessionId: number, route: ZoneWorkerRoute): void {
    this.routes.set(sessionId, route);
  }

  clearRoute(sessionId: number): void {
    this.routes.delete(sessionId);
  }

  routeInbound(packet: InboundPacket): void {
    const worldResult = this.deps.handleWorldPacket(packet);
    if (!worldResult.forwardToZone) {
      return;
    }

    const existing = this.routes.get(packet.sessionId);
    const zoneId = worldResult.zoneId;
    const instanceId = worldResult.instanceId;

    const nextRoute: ZoneWorkerRoute = {
      zoneId,
      instanceId,
      workerId: `zone:${zoneId}:${instanceId}`,
    };

    if (!existing || existing.zoneId !== nextRoute.zoneId || existing.instanceId !== nextRoute.instanceId) {
      this.routes.set(packet.sessionId, nextRoute);
      this.logger.info('Session routed to zone worker', {
        sessionId: packet.sessionId,
        workerId: nextRoute.workerId,
      });
    }

    this.deps.handleZonePacket(packet, zoneId, instanceId, worldResult.characterName);
  }
}
