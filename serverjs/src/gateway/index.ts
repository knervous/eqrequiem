import { HttpServer, quicheLoaded } from "@fails-components/webtransport";
import type { AppEnv } from "../config/env.js";
import {
  ControlFrameAssembler,
  decodePacket,
  encodeControlStreamFrame,
  encodePacket,
  type InboundTransport,
} from "../protocol/index.js";
import type { Logger } from "../shared/logger.js";
import type { TransportCertProvider } from "../transport/cert-provider.js";
import type { GameTransportService } from "../transport/game-transport.js";
import { ZoneRouter, type RouterDependencies } from "./zone-router.js";

interface SessionRecord {
  sessionId: number;
  ip: string;
  transport: SessionLike;
  datagramWriter: WritableStreamDefaultWriter<Uint8Array>;
  controlWriter: WritableStreamDefaultWriter<Uint8Array>;
}

interface SessionLike {
  ready: Promise<void>;
  closed: Promise<unknown>;
  peerAddress?: string;
  userData?: unknown;
  datagrams: {
    readable: ReadableStream<Uint8Array>;
    writable?: WritableStream<Uint8Array>;
    createWritable(): WritableStream<Uint8Array>;
  };
  createBidirectionalStream(): Promise<{
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
  }>;
  close(args: { closeCode: number; reason: string }): void;
}

interface HttpServerLike {
  sessionStream(path: string): ReadableStream<SessionLike>;
  startServer(): void;
  stopServer(): void;
  ready: Promise<unknown>;
  closed: Promise<unknown>;
  address(): { host: string; port: number } | null;
}

export class GatewayService implements GameTransportService {
  readonly kind = "webtransport" as const;
  private server: HttpServerLike | null = null;
  private acceptingPromise: Promise<void> | null = null;
  private isStopping = false;
  private nextSessionId = 1;
  private readonly sessions = new Map<number, SessionRecord>();
  private readonly router: ZoneRouter;

  constructor(
    private readonly env: AppEnv,
    private readonly logger: Logger,
    private readonly certProvider: TransportCertProvider,
    deps: RouterDependencies & {
      onSessionConnected(sessionId: number, ip: string): void;
      onSessionDisconnected(sessionId: number): void;
    },
  ) {
    this.router = new ZoneRouter(logger, deps);
    this.onSessionConnected = (sessionId, ip) => {
      deps.onSessionConnected(sessionId, ip);
    };
    this.onSessionDisconnected = (sessionId) => {
      deps.onSessionDisconnected(sessionId);
    };
  }

  private readonly onSessionConnected: (sessionId: number, ip: string) => void;
  private readonly onSessionDisconnected: (sessionId: number) => void;

  async start(): Promise<void> {
    await withTimeout(
      quicheLoaded,
      this.env.transport.readyTimeoutMs,
      "HTTP/3 quiche transport failed to load",
    );

    const material = await this.certProvider.getMaterial();

    const server = new HttpServer({
      host: this.env.transport.host,
      port: this.env.transport.port,
      secret: this.env.transport.secret,
      cert: material.certPem,
      privKey: material.keyPem,
      reliability: "both",
      defaultDatagramsReadableMode: "bytes",
    }) as unknown as HttpServerLike;

    const stream = server.sessionStream(this.env.transport.path);
    server.startServer();
    await withTimeout(
      server.ready,
      this.env.transport.readyTimeoutMs,
      "WebTransport server did not report ready",
    );

    this.server = server;

    const address = server.address();
    this.logger.info("WebTransport gateway started", {
      path: this.env.transport.path,
      host: address?.host ?? this.env.transport.host,
      port: address?.port ?? this.env.transport.port,
    });

    this.acceptingPromise = this.acceptSessions(stream);
  }

  async stop(): Promise<void> {
    this.isStopping = true;

    for (const record of this.sessions.values()) {
      this.safeCloseTransport(record.transport, 0, "server shutdown");
    }

    this.sessions.clear();

    if (this.server) {
      this.server.stopServer();
      await this.server.closed;
      this.server = null;
    }

    if (this.acceptingPromise) {
      await this.acceptingPromise;
      this.acceptingPromise = null;
    }

    this.logger.info("Gateway stopped");
  }

  async sendDatagram(
    sessionId: number,
    opcode: number,
    payload: Uint8Array = new Uint8Array(0),
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`session ${sessionId} not found`);
    }

    await session.datagramWriter.write(encodePacket(opcode, payload));
  }

  async sendStream(
    sessionId: number,
    opcode: number,
    payload: Uint8Array = new Uint8Array(0),
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`session ${sessionId} not found`);
    }

    await session.controlWriter.write(
      encodeControlStreamFrame(opcode, payload),
    );
  }

  private async acceptSessions(
    stream: ReadableStream<SessionLike>,
  ): Promise<void> {
    const reader = stream.getReader();

    try {
      while (!this.isStopping) {
        const { done, value } = await reader.read();
        if (done || !value) {
          break;
        }

        void this.handleConnectedSession(value);
      }
    } finally {
      reader.releaseLock();
    }
  }

  private async handleConnectedSession(transport: SessionLike): Promise<void> {
    await transport.ready;

    const requestedSid = this.requestedSidFromSession(transport);
    const peerIp = extractPeerIp(transport.peerAddress);

    let sessionId: number;
    if (requestedSid > 0 && this.canReconnect(requestedSid, peerIp)) {
      sessionId = requestedSid;
      const previous = this.sessions.get(sessionId);
      if (previous) {
        this.safeCloseTransport(previous.transport, 0, "session replaced");
      }
      this.logger.info("Session reconnected", { sessionId, peerIp });
    } else {
      sessionId = this.nextSessionId++;
      this.logger.info("Session accepted", { sessionId, peerIp });
    }

    const datagramWriter = this.getDatagramWriter(transport);
    const control = await transport.createBidirectionalStream();
    const controlWriter = control.writable.getWriter();

    const record: SessionRecord = {
      sessionId,
      ip: peerIp,
      transport,
      datagramWriter,
      controlWriter,
    };

    this.sessions.set(sessionId, record);
    this.onSessionConnected(sessionId, peerIp);

    void this.readDatagrams(record);
    void this.readControlStream(record, control.readable);

    transport.closed
      .then(() => {
        this.logger.info("Transport closed", { sessionId });
        this.cleanupSession(sessionId, transport);
      })
      .catch((error) => {
        this.logger.warn("Transport closed with error", {
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
        this.cleanupSession(sessionId, transport);
      });
  }

  private async readDatagrams(record: SessionRecord): Promise<void> {
    const reader = record.transport.datagrams.readable.getReader();

    try {
      while (!this.isStopping) {
        const { done, value } = await reader.read();
        if (done || !value) {
          break;
        }

        this.routeIncomingPacket(record.sessionId, "datagram", value);
      }
    } catch (error) {
      this.logger.warn("Datagram reader stopped", {
        sessionId: record.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      reader.releaseLock();
    }
  }

  private async readControlStream(
    record: SessionRecord,
    stream: ReadableStream<Uint8Array>,
  ): Promise<void> {
    const assembler = new ControlFrameAssembler();
    const reader = stream.getReader();

    try {
      while (!this.isStopping) {
        const { done, value } = await reader.read();
        if (done || !value) {
          break;
        }

        for (const frame of assembler.push(value)) {
          this.routeIncomingPacket(record.sessionId, "control-stream", frame);
        }
      }
    } catch (error) {
      this.logger.warn("Control stream reader stopped", {
        sessionId: record.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      reader.releaseLock();
    }
  }

  private routeIncomingPacket(
    sessionId: number,
    transport: InboundTransport,
    packet: Uint8Array,
  ): void {
    const decoded = decodePacket(packet);
    if (!decoded) {
      this.logger.warn("Dropping malformed packet", {
        sessionId,
        transport,
        byteLength: packet.byteLength,
      });
      return;
    }

    this.router.routeInbound({
      sessionId,
      transport,
      opcode: decoded.opcode,
      payload: decoded.payload,
    });
  }

  private cleanupSession(sessionId: number, transport: SessionLike): void {
    const existing = this.sessions.get(sessionId);
    if (!existing || existing.transport !== transport) {
      return;
    }

    this.router.clearRoute(sessionId);
    this.onSessionDisconnected(sessionId);
    this.sessions.delete(sessionId);
  }

  private canReconnect(sessionId: number, ip: string): boolean {
    const existing = this.sessions.get(sessionId);
    if (!existing) {
      return false;
    }

    return existing.ip === ip;
  }

  private getDatagramWriter(
    transport: SessionLike,
  ): WritableStreamDefaultWriter<Uint8Array> {
    if ("writable" in transport.datagrams && transport.datagrams.writable) {
      return transport.datagrams.writable.getWriter();
    }

    return transport.datagrams.createWritable().getWriter();
  }

  private requestedSidFromSession(transport: SessionLike): number {
    const userData = transport.userData;
    if (!userData || typeof userData !== "object") {
      return 0;
    }

    const sidValue = (userData as Record<string, unknown>).sid;
    if (
      typeof sidValue !== "number" ||
      !Number.isInteger(sidValue) ||
      sidValue < 0
    ) {
      return 0;
    }

    return sidValue;
  }

  private safeCloseTransport(
    transport: SessionLike,
    closeCode: number,
    reason: string,
  ): void {
    try {
      transport.close({ closeCode, reason });
    } catch (error) {
      this.logger.debug("Error closing transport", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  const timeoutPromise = new Promise<T>((_, reject) => {
    setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}

function extractPeerIp(peerAddress: string | undefined): string {
  if (!peerAddress) {
    return "unknown";
  }

  if (peerAddress.startsWith("[")) {
    const closing = peerAddress.indexOf("]");
    return closing > 0 ? peerAddress.slice(1, closing) : peerAddress;
  }

  const lastColon = peerAddress.lastIndexOf(":");
  if (lastColon === -1) {
    return peerAddress;
  }

  return peerAddress.slice(0, lastColon);
}
