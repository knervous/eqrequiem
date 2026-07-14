import type { AppEnv } from "./config/env.js";
import { DbService } from "./db/index.js";
import { GatewayService } from "./gateway/index.js";
import { LibraService } from "./libra/index.js";
import { NavService } from "./nav/index.js";
import { PersistService } from "./persist/index.js";
import type { InboundPacket } from "./protocol/index.js";
import type { Logger } from "./shared/logger.js";
import { TransportCertProvider } from "./transport/cert-provider.js";
import { WorldService } from "./world/index.js";
import { ZoneService } from "./zone/index.js";

interface Service {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export class BackendApp {
  private readonly dbService: DbService;
  private readonly worldService: WorldService;
  private readonly zoneService: ZoneService;
  private readonly persistService: PersistService;
  private readonly navService: NavService;
  private readonly libraService: LibraService;
  private readonly gatewayService: GatewayService;
  private readonly transportCertProvider: TransportCertProvider;

  private readonly services: Service[];

  constructor(
    private readonly env: AppEnv,
    private readonly logger: Logger,
  ) {
    this.dbService = new DbService(this.env, this.logger);
    this.persistService = new PersistService(this.env, this.logger);
    this.worldService = new WorldService(this.logger, this.persistService);
    this.zoneService = new ZoneService(
      this.env,
      this.logger,
      this.persistService,
      this.dbService,
    );
    this.navService = new NavService(this.env, this.logger);
    this.transportCertProvider = new TransportCertProvider(
      this.env,
      this.logger,
    );
    this.libraService = new LibraService(
      this.env,
      this.logger,
      this.dbService,
      {
        mode: "full-backend",
        certificateSource: this.transportCertProvider,
        zones: this.zoneService,
      },
    );
    this.gatewayService = new GatewayService(
      this.env,
      this.logger,
      this.transportCertProvider,
      {
        onSessionConnected: (sessionId, ip) => {
          this.worldService.onSessionConnected(sessionId, ip);
        },
        onSessionDisconnected: (sessionId) => {
          this.worldService.onSessionDisconnected(sessionId);
          this.zoneService.onSessionDisconnected(sessionId);
        },
        handleWorldPacket: (packet: InboundPacket) => {
          return this.worldService.handleInbound(packet);
        },
        handleZonePacket: (
          packet: InboundPacket,
          zoneId: number,
          instanceId: number,
          characterName?: string | null,
        ) => {
          this.zoneService.handleInbound(packet, zoneId, instanceId, characterName);
        },
      },
    );

    this.worldService.setMessenger(this.gatewayService);
    this.zoneService.setMessenger(this.gatewayService);

    this.services = [
      this.dbService,
      this.worldService,
      this.zoneService,
      this.persistService,
      this.navService,
      this.libraService,
      this.gatewayService,
    ];
  }

  async start(): Promise<void> {
    for (const service of this.services) {
      await service.start();
    }

    this.logger.info("Backend scaffold started");
  }

  async stop(): Promise<void> {
    const reversed = [...this.services].reverse();
    for (const service of reversed) {
      await service.stop();
    }

    this.logger.info("Backend scaffold stopped");
  }
}
