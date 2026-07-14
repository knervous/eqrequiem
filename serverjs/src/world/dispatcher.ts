import { HandlerRegistry } from "../protocol/handler-registry.js";
import {
  decodeCharacterCreate,
  decodeCharacterDeleteName,
  decodeEnterWorldName,
  decodeJwtLoginToken,
  decodeZoneRouteRequest,
  encodeCharacterSelect,
  encodeIntValue,
  encodeJwtResponse,
} from "../protocol/game-codec.js";
import { OP, WORLD_GLOBAL_OPCODES } from "../protocol/opcodes.js";
import type { InboundPacket } from "../protocol/index.js";
import type { PersistService } from "../persist/index.js";
import type { Logger } from "../shared/logger.js";
import type { GameMessenger } from "../transport/game-transport.js";
import { SessionManager, type SessionState } from "./session-manager.js";

export type GatewayMessenger = GameMessenger;

interface WorldHandlerContext {
  packet: InboundPacket;
  session: SessionState;
}

export class WorldDispatcher {
  private readonly registry = new HandlerRegistry<WorldHandlerContext>();
  private readonly sessionManager = new SessionManager();
  private messenger: GatewayMessenger | null = null;

  constructor(
    private readonly logger: Logger,
    private readonly persist: PersistService,
  ) {
    this.installHandlers();
  }

  setMessenger(messenger: GatewayMessenger): void {
    this.messenger = messenger;
  }

  onSessionConnected(sessionId: number, ip: string): void {
    this.sessionManager.create(sessionId, ip);
    void this.persist
      .loginLoad("guest")
      .then((result) => {
        this.sessionManager.authenticate(sessionId, result.accountId);
        this.sendDatagram(
          sessionId,
          OP.JWT_RESPONSE,
          encodeJwtResponse(sessionId),
        );
        this.sendStream(
          sessionId,
          OP.SEND_CHAR_INFO,
          encodeCharacterSelect(result.characters),
        );
      })
      .catch((error: unknown) => {
        this.logger.warn("Guest session bootstrap failed", {
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }

  onSessionDisconnected(sessionId: number): void {
    this.sessionManager.remove(sessionId);
  }

  handleInbound(packet: InboundPacket): {
    forwardToZone: boolean;
    zoneId: number;
    instanceId: number;
    characterName?: string | null;
  } {
    const session = this.sessionManager.get(packet.sessionId);
    if (!session) {
      this.logger.warn("Dropping packet for missing session", {
        sessionId: packet.sessionId,
        opcode: packet.opcode,
      });
      return { forwardToZone: false, zoneId: -1, instanceId: 0 };
    }

    const isWorldGlobal = WORLD_GLOBAL_OPCODES.has(packet.opcode);
    if (isWorldGlobal) {
      const forwardToZone = this.registry.dispatch(packet.opcode, {
        packet,
        session,
      });
      return {
        forwardToZone,
        zoneId: session.zoneId,
        instanceId: session.instanceId,
        characterName: session.characterName,
      };
    }

    if (!session.authenticated) {
      this.logger.warn("Dropping unauthenticated opcode", {
        sessionId: packet.sessionId,
        opcode: packet.opcode,
      });
      return {
        forwardToZone: false,
        zoneId: session.zoneId,
        instanceId: session.instanceId,
      };
    }

    if (session.zoneId === -1) {
      this.logger.warn("Dropping packet with no zone assignment", {
        sessionId: packet.sessionId,
        opcode: packet.opcode,
      });
      return {
        forwardToZone: false,
        zoneId: session.zoneId,
        instanceId: session.instanceId,
      };
    }

    return {
      forwardToZone: true,
      zoneId: session.zoneId,
      instanceId: session.instanceId,
      characterName: session.characterName,
    };
  }

  metrics(): {
    handlers: ReturnType<HandlerRegistry<WorldHandlerContext>["metrics"]>;
  } {
    return { handlers: this.registry.metrics() };
  }

  private installHandlers(): void {
    this.registry.register(OP.JWT_LOGIN, ({ packet, session }) => {
      const token = decodeJwtLoginToken(packet.payload);
      if (!token) {
        this.sendDatagram(
          session.sessionId,
          OP.JWT_RESPONSE,
          encodeJwtResponse(-100),
        );
        return false;
      }

      void this.persist
        .loginLoad(token)
        .then((result) => {
          this.sessionManager.authenticate(session.sessionId, result.accountId);
          this.sendDatagram(
            session.sessionId,
            OP.JWT_RESPONSE,
            encodeJwtResponse(session.sessionId),
          );
          this.sendStream(
            session.sessionId,
            OP.SEND_CHAR_INFO,
            encodeCharacterSelect(result.characters),
          );
        })
        .catch((error: unknown) => {
          this.logger.warn("Persist login load failed", {
            sessionId: session.sessionId,
            error: error instanceof Error ? error.message : String(error),
          });
          this.sendDatagram(
            session.sessionId,
            OP.JWT_RESPONSE,
            encodeJwtResponse(-100),
          );
        });
      return false;
    });

    this.registry.register(OP.CHARACTER_CREATE, ({ packet, session }) => {
      if (!session.accountId) {
        return false;
      }

      const value = decodeCharacterCreate(packet.payload);
      if (!value) return false;
      const number = (input: unknown, fallback = 0) => {
        const parsed = Number(input);
        return Number.isFinite(parsed) ? parsed : fallback;
      };
      const character = {
        name: String(value.name ?? ""), charClass: number(value.charClass, 1),
        race: number(value.race, 1), gender: number(value.gender), deity: number(value.deity),
        startZone: number(value.startZone), face: number(value.face),
        str: number(value.str, Number.NaN), sta: number(value.sta, Number.NaN),
        agi: number(value.agi, Number.NaN), dex: number(value.dex, Number.NaN),
        wis: number(value.wis, Number.NaN), intel: number(value.intel, Number.NaN),
        cha: number(value.cha, Number.NaN),
      };
      void this.persist
        .createCharacter(session.accountId, character)
        .then((result) => {
          this.sendDatagram(
            session.sessionId,
            OP.APPROVE_NAME_SERVER,
            encodeIntValue(result.ok ? 1 : 0),
          );
          this.sendStream(
            session.sessionId,
            OP.SEND_CHAR_INFO,
            encodeCharacterSelect(result.characters),
          );
        })
        .catch((error: unknown) => {
          this.logger.warn("Persist character create failed", {
            sessionId: session.sessionId,
            error: error instanceof Error ? error.message : String(error),
          });
          this.sendDatagram(
            session.sessionId,
            OP.APPROVE_NAME_SERVER,
            encodeIntValue(0),
          );
        });
      return false;
    });

    this.registry.register(OP.DELETE_CHARACTER, ({ packet, session }) => {
      if (!session.accountId) {
        return false;
      }

      const name = decodeCharacterDeleteName(packet.payload);
      void this.persist
        .deleteCharacter(session.accountId, name)
        .then((result) => {
          this.sendStream(
            session.sessionId,
            OP.SEND_CHAR_INFO,
            encodeCharacterSelect(result.characters),
          );
        })
        .catch((error: unknown) => {
          this.logger.warn("Persist character delete failed", {
            sessionId: session.sessionId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      return false;
    });

    this.registry.register(OP.ENTER_WORLD, ({ packet, session }) => {
      const characterName = decodeEnterWorldName(packet.payload);
      if (!characterName) {
        this.sendDatagram(session.sessionId, OP.POST_ENTER_WORLD, encodeIntValue(0));
        return false;
      }
      this.sessionManager.selectCharacter(session.sessionId, characterName);
      this.sendDatagram(
        session.sessionId,
        OP.POST_ENTER_WORLD,
        encodeIntValue(1),
      );
      return false;
    });

    this.registry.register(OP.ZONE_SESSION, ({ packet, session }) => {
      const zoneRequest = decodeZoneRouteRequest(packet.payload);
      this.sessionManager.updateZone(
        session.sessionId,
        zoneRequest.zoneId,
        zoneRequest.instanceId,
      );
      this.sendDatagram(
        session.sessionId,
        OP.ZONE_SESSION_VALID,
        encodeIntValue(1),
      );
      return false;
    });

    this.registry.register(
      OP.REQUEST_CLIENT_ZONE_CHANGE,
      ({ packet, session }) => {
        const zoneRequest = decodeZoneRouteRequest(packet.payload);
        if (zoneRequest.zoneId >= 0) {
          this.sessionManager.updateZone(session.sessionId, zoneRequest.zoneId, zoneRequest.instanceId);
        }
        return true;
      },
    );
  }

  private sendDatagram(
    sessionId: number,
    opcode: number,
    payload?: Uint8Array,
  ): void {
    if (!this.messenger) {
      this.logger.warn("Gateway messenger not attached for datagram send", {
        sessionId,
        opcode,
      });
      return;
    }

    void this.messenger
      .sendDatagram(sessionId, opcode, payload)
      .catch((error: unknown) => {
        this.logger.warn("Datagram send failed", {
          sessionId,
          opcode,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }

  private sendStream(
    sessionId: number,
    opcode: number,
    payload?: Uint8Array,
  ): void {
    if (!this.messenger) {
      this.logger.warn("Gateway messenger not attached for stream send", {
        sessionId,
        opcode,
      });
      return;
    }

    void this.messenger
      .sendStream(sessionId, opcode, payload)
      .catch((error: unknown) => {
        this.logger.warn("Stream send failed", {
          sessionId,
          opcode,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }
}
