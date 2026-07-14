import { HandlerRegistry } from "../protocol/handler-registry.js";
import { OP, ZONE_HANDLED_OPCODES } from "../protocol/opcodes.js";
import type { InboundPacket } from "../protocol/index.js";
import type { Logger } from "../shared/logger.js";

interface ZoneHandlerContext {
  packet: InboundPacket;
  zoneId: number;
  instanceId: number;
}

export class ZoneDispatcher {
  private readonly registry = new HandlerRegistry<ZoneHandlerContext>();

  constructor(private readonly logger: Logger) {
    this.installHandlers();
  }

  handleInbound(
    packet: InboundPacket,
    zoneId: number,
    instanceId: number,
  ): boolean {
    if (!ZONE_HANDLED_OPCODES.has(packet.opcode)) {
      this.logger.warn("Unknown zone opcode", {
        sessionId: packet.sessionId,
        opcode: packet.opcode,
        zoneId,
        instanceId,
      });
      return false;
    }

    this.registry.dispatch(packet.opcode, {
      packet,
      zoneId,
      instanceId,
    });
    return true;
  }

  metrics(): {
    handlers: ReturnType<HandlerRegistry<ZoneHandlerContext>["metrics"]>;
  } {
    return { handlers: this.registry.metrics() };
  }

  private installHandlers(): void {
    this.registry.register(
      OP.REQUEST_CLIENT_ZONE_CHANGE,
      ({ packet, zoneId, instanceId }) => {
        this.logger.info("Zone change request forwarded to zone worker", {
          sessionId: packet.sessionId,
          zoneId,
          instanceId,
        });
      },
    );

    this.registry.register(
      OP.CHANNEL_MESSAGE,
      ({ packet, zoneId, instanceId }) => {
        this.logger.debug("Channel message routed to zone worker", {
          sessionId: packet.sessionId,
          zoneId,
          instanceId,
          payloadSize: packet.payload.byteLength,
        });
      },
    );

    this.registry.register(
      OP.CLIENT_UPDATE,
      ({ packet, zoneId, instanceId }) => {
        this.logger.debug("Client update routed to zone worker", {
          sessionId: packet.sessionId,
          zoneId,
          instanceId,
        });
      },
    );

    this.registry.register(OP.ANIMATION, ({ packet, zoneId, instanceId }) => {
      this.logger.debug("Animation routed to zone worker", {
        sessionId: packet.sessionId,
        zoneId,
        instanceId,
      });
    });

    this.registry.register(OP.CAMP, ({ packet, zoneId, instanceId }) => {
      this.logger.info("Camp request routed to zone worker", {
        sessionId: packet.sessionId,
        zoneId,
        instanceId,
      });
    });

    this.registry.register(OP.MOVE_ITEM, ({ packet, zoneId, instanceId }) => {
      this.logger.debug("MoveItem routed to zone worker", {
        sessionId: packet.sessionId,
        zoneId,
        instanceId,
      });
    });

    this.registry.register(OP.DELETE_ITEM, ({ packet, zoneId, instanceId }) => {
      this.logger.debug("DeleteItem routed to zone worker", {
        sessionId: packet.sessionId,
        zoneId,
        instanceId,
      });
    });

    this.registry.register(OP.GM_COMMAND, ({ packet, zoneId, instanceId }) => {
      this.logger.info("GM command routed to zone worker", {
        sessionId: packet.sessionId,
        zoneId,
        instanceId,
      });
    });
  }
}
