import {
  decodeDeleteItemRequest,
  decodeMoveItemRequest,
  decodeZoneRouteRequest,
} from "../protocol/game-codec.js";
import { OP } from "../protocol/opcodes.js";
import {
  decodeSidecar,
  encodeSidecar,
  SIDECAR_SCHEMA,
} from "../protocol/sidecar-codec.js";
import { encodeWorldSpawnBatch, type WorldSpawnInput } from "../protocol/world-state.js";
import type {
  BackendEvent,
  BackendRequest,
  BackendTransport,
  GameBackend,
} from "./contracts.js";

export interface BackendInboundPacket {
  opcode: number;
  payload: Uint8Array;
  transport: BackendTransport;
}

export interface BackendOutboundPacket {
  opcode: number;
  payload: Uint8Array;
  transport: BackendTransport;
}

/** The single packet-to-domain adapter used by Worker and network transports. */
export class GameBackendPacketAdapter {
  constructor(private readonly backend: GameBackend) {}

  async connect(sessionId: number): Promise<BackendOutboundPacket[]> {
    return this.encodeEvents(await this.backend.connect(sessionId));
  }

  disconnect(sessionId: number): Promise<void> {
    return this.backend.disconnect(sessionId);
  }

  async receive(
    sessionId: number,
    packet: BackendInboundPacket,
  ): Promise<BackendOutboundPacket[]> {
    const request = decodeRequest(packet.opcode, packet.payload);
    if (!request) return [];
    return this.encodeEvents(await this.backend.handle(sessionId, request));
  }

  private encodeEvents(events: readonly BackendEvent[]): BackendOutboundPacket[] {
    return events.map((event) => encodeEvent(event));
  }
}

export function decodeRequest(opcode: number, payload: Uint8Array): BackendRequest | null {
  switch (opcode) {
    case OP.JWT_LOGIN: {
      const value = decodeSidecar<{ token?: unknown }>(SIDECAR_SCHEMA.JWT_LOGIN, payload);
      return { type: "login", token: typeof value?.token === "string" ? value.token : "guest" };
    }
    case OP.CHARACTER_CREATE: {
      const value = decodeSidecar<Record<string, unknown>>(
        SIDECAR_SCHEMA.CHARACTER_CREATE,
        payload,
      );
      if (!value) return null;
      return {
        type: "character_create",
        character: {
          name: String(value.name ?? ""),
          charClass: number(value.charClass, 1),
          race: number(value.race, 1),
          gender: number(value.gender, 0),
          deity: number(value.deity, 0),
          startZone: number(value.startZone, 0),
          face: number(value.face, 0),
          str: number(value.str, Number.NaN),
          sta: number(value.sta, Number.NaN),
          agi: number(value.agi, Number.NaN),
          dex: number(value.dex, Number.NaN),
          wis: number(value.wis, Number.NaN),
          intel: number(value.intel, Number.NaN),
          cha: number(value.cha, Number.NaN),
        },
      };
    }
    case OP.DELETE_CHARACTER: {
      const value = decodeSidecar<{ value?: unknown }>(SIDECAR_SCHEMA.STRING, payload);
      return { type: "character_delete", name: String(value?.value ?? "") };
    }
    case OP.ENTER_WORLD: {
      const value = decodeSidecar<{ name?: unknown }>(SIDECAR_SCHEMA.ENTER_WORLD, payload);
      return { type: "enter_world", name: String(value?.name ?? "") };
    }
    case OP.ZONE_SESSION: {
      const value = decodeZone(payload, SIDECAR_SCHEMA.ZONE_SESSION);
      return { type: "zone_session", zoneId: value.zoneId, instanceId: value.instanceId };
    }
    case OP.REQUEST_CLIENT_ZONE_CHANGE: {
      const sidecar = decodeSidecar<{ zoneId?: unknown; instanceId?: unknown }>(
        SIDECAR_SCHEMA.ZONE_CHANGE,
        payload,
      );
      const value = sidecar ?? decodeZoneRouteRequest(payload);
      const zoneId = value.zoneId;
      return {
        type: "zone_change",
        ...(
          zoneId === undefined || (typeof zoneId === "number" && zoneId < 0)
            ? {}
            : { zoneId: zoneId as number | string }
        ),
        instanceId: number(value.instanceId, 0),
      };
    }
    case OP.GM_COMMAND: {
      const value = decodeSidecar<{ command?: unknown; args?: unknown }>(
        SIDECAR_SCHEMA.COMMAND,
        payload,
      );
      return {
        type: "gm_command",
        command: String(value?.command ?? ""),
        args: Array.isArray(value?.args) ? value.args.map(String) : [],
      };
    }
    case OP.CHANNEL_MESSAGE: {
      const value = decodeSidecar<Record<string, unknown>>(
        SIDECAR_SCHEMA.CHANNEL,
        payload,
      );
      if (!value) return null;
      return {
        type: "channel_message",
        sender: String(value.sender ?? ""),
        targetName: String(value.targetName ?? value.targetname ?? value.target ?? ""),
        message: String(value.message ?? ""),
        channel: number(value.chanNum, 0),
      };
    }
    case OP.MOVE_ITEM: {
      const value = decodeMoveItemRequest(payload);
      return value ? { type: "move_item", ...value } : null;
    }
    case OP.DELETE_ITEM: {
      const value = decodeDeleteItemRequest(payload);
      return value ? { type: "delete_item", ...value } : null;
    }
    default:
      return null;
  }
}

export function encodeEvent(event: BackendEvent): BackendOutboundPacket {
  if (event.type === "zone_spawns") {
    const spawns = Array.isArray(event.value.spawns)
      ? event.value.spawns as WorldSpawnInput[]
      : [];
    return {
      opcode: OP.BATCH_ZONE_SPAWNS,
      payload: encodeWorldSpawnBatch(spawns),
      transport: event.transport ?? "control-stream",
    };
  }
  const [opcode, schema] = eventEncoding[event.type];
  return {
    opcode,
    payload: encodeSidecar(schema, event.value),
    transport: event.transport ?? "datagram",
  };
}

const eventEncoding: Record<BackendEvent["type"], readonly [number, number]> = {
  jwt_response: [OP.JWT_RESPONSE, SIDECAR_SCHEMA.JWT_RESPONSE],
  character_select: [OP.SEND_CHAR_INFO, SIDECAR_SCHEMA.CHARACTER_SELECT],
  approve_name: [OP.APPROVE_NAME_SERVER, SIDECAR_SCHEMA.INT],
  post_enter_world: [OP.POST_ENTER_WORLD, SIDECAR_SCHEMA.INT],
  zone_session_valid: [OP.ZONE_SESSION_VALID, SIDECAR_SCHEMA.INT],
  new_zone: [OP.NEW_ZONE, SIDECAR_SCHEMA.NEW_ZONE],
  player_profile: [OP.PLAYER_PROFILE, SIDECAR_SCHEMA.PLAYER_PROFILE],
  zone_spawns: [OP.BATCH_ZONE_SPAWNS, SIDECAR_SCHEMA.SPAWNS],
  channel_message: [OP.CHANNEL_MESSAGE, SIDECAR_SCHEMA.CHANNEL],
  level_update: [OP.LEVEL_UPDATE, SIDECAR_SCHEMA.LEVEL],
  add_item: [OP.ADD_ITEM_PACKET, SIDECAR_SCHEMA.ITEM],
  bulk_items: [OP.ITEM_PACKET, SIDECAR_SCHEMA.BULK_ITEMS],
  delete_item: [OP.DELETE_ITEM, SIDECAR_SCHEMA.DELETE_ITEM],
  bulk_delete_items: [OP.BULK_DELETE_ITEMS, SIDECAR_SCHEMA.BULK_DELETE_ITEMS],
  move_item: [OP.MOVE_ITEM, SIDECAR_SCHEMA.MOVE_ITEM],
};

function decodeZone(
  payload: Uint8Array,
  schema: number,
): { zoneId: number | string; instanceId: number } {
  const sidecar = decodeSidecar<{ zoneId?: unknown; instanceId?: unknown }>(schema, payload);
  if (sidecar) {
    return {
      zoneId: typeof sidecar.zoneId === "string"
        ? sidecar.zoneId
        : number(sidecar.zoneId, -1),
      instanceId: number(sidecar.instanceId, 0),
    };
  }
  const packed = decodeZoneRouteRequest(payload);
  return { zoneId: packed.zoneId, instanceId: packed.instanceId };
}

function number(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
