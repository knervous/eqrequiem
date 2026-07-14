import type { InboundPacket } from '../protocol/index.js';
import type { PersistService } from '../persist/index.js';
import type { Logger } from '../shared/logger.js';
import { WorldDispatcher, type GatewayMessenger } from './dispatcher.js';

export class WorldService {
  private readonly dispatcher: WorldDispatcher;

  constructor(
    private readonly logger: Logger,
    persist: PersistService,
  ) {
    this.dispatcher = new WorldDispatcher(logger, persist);
  }

  setMessenger(messenger: GatewayMessenger): void {
    this.dispatcher.setMessenger(messenger);
  }

  onSessionConnected(sessionId: number, ip: string): void {
    this.dispatcher.onSessionConnected(sessionId, ip);
  }

  onSessionDisconnected(sessionId: number): void {
    this.dispatcher.onSessionDisconnected(sessionId);
  }

  handleInbound(packet: InboundPacket): { forwardToZone: boolean; zoneId: number; instanceId: number; characterName?: string | null } {
    return this.dispatcher.handleInbound(packet);
  }

  start(): Promise<void> {
    this.logger.info('World service started');
    return Promise.resolve();
  }

  stop(): Promise<void> {
    this.logger.info('World service stopped', this.dispatcher.metrics());
    return Promise.resolve();
  }
}
