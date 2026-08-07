import {
  decodeClientPositionRequest,
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
import {
  encodeWorldSpawnBatch,
  type WorldSpawnInput,
} from "../protocol/world-state.js";
import type {
  BackendEvent,
  BackendRequest,
  BackendTransport,
  GameBackend,
} from "./contracts.js";
import { readEltaniaCharacterContractFields } from "./eltania-character-adapter.js";

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
  private readonly listeners = new Set<
    (sessionIds: readonly number[], packet: BackendOutboundPacket) => void
  >();
  private readonly unsubscribe: (() => void) | undefined;

  constructor(private readonly backend: GameBackend) {
    this.unsubscribe = backend.subscribe?.((delivery) => {
      const packet = encodeEvent(delivery.event);
      for (const listener of this.listeners)
        listener(delivery.sessionIds, packet);
    });
  }

  onPacket(
    listener: (
      sessionIds: readonly number[],
      packet: BackendOutboundPacket,
    ) => void,
  ): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async connect(sessionId: number): Promise<BackendOutboundPacket[]> {
    return this.encodeEvents(await this.backend.connect(sessionId));
  }

  disconnect(sessionId: number): Promise<void> {
    return this.backend.disconnect(sessionId);
  }

  async close(sessionId: number): Promise<void> {
    try {
      await this.backend.disconnect(sessionId);
    } finally {
      this.unsubscribe?.();
      this.listeners.clear();
      await this.backend.close();
    }
  }

  async receive(
    sessionId: number,
    packet: BackendInboundPacket,
  ): Promise<BackendOutboundPacket[]> {
    const request = decodeRequest(packet.opcode, packet.payload);
    if (!request) return [];
    return this.encodeEvents(await this.backend.handle(sessionId, request));
  }

  private encodeEvents(
    events: readonly BackendEvent[],
  ): BackendOutboundPacket[] {
    return events.map((event) => encodeEvent(event));
  }
}

export function decodeRequest(
  opcode: number,
  payload: Uint8Array,
): BackendRequest | null {
  switch (opcode) {
    case OP.JWT_LOGIN: {
      const value = decodeSidecar<{ token?: unknown }>(
        SIDECAR_SCHEMA.JWT_LOGIN,
        payload,
      );
      return {
        type: "login",
        token: typeof value?.token === "string" ? value.token : "guest",
      };
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
          ...readEltaniaCharacterContractFields(value),
        },
      };
    }
    case OP.DELETE_CHARACTER: {
      const value = decodeSidecar<{ value?: unknown }>(
        SIDECAR_SCHEMA.STRING,
        payload,
      );
      return { type: "character_delete", name: String(value?.value ?? "") };
    }
    case OP.ENTER_WORLD: {
      const value = decodeSidecar<{ name?: unknown }>(
        SIDECAR_SCHEMA.ENTER_WORLD,
        payload,
      );
      return { type: "enter_world", name: String(value?.name ?? "") };
    }
    case OP.ZONE_SESSION: {
      const value = decodeZone(payload, SIDECAR_SCHEMA.ZONE_SESSION);
      return {
        type: "zone_session",
        zoneId: value.zoneId,
        instanceId: value.instanceId,
      };
    }
    case OP.REQUEST_CLIENT_ZONE_CHANGE: {
      const value = decodeZoneRouteRequest(payload);
      const zoneId = value.zoneId;
      return {
        type: "zone_change",
        ...(zoneId === undefined || (typeof zoneId === "number" && zoneId < 0)
          ? {}
          : { zoneId: zoneId as number | string }),
        instanceId: number(value.instanceId, 0),
        ...(value.useSafeLocation === true ? { useSafeLocation: true } : {}),
        ...(typeof value.x === "number" && Number.isFinite(value.x)
          ? { x: value.x }
          : {}),
        ...(typeof value.y === "number" && Number.isFinite(value.y)
          ? { y: value.y }
          : {}),
        ...(typeof value.z === "number" && Number.isFinite(value.z)
          ? { z: value.z }
          : {}),
        ...(typeof value.heading === "number" && Number.isFinite(value.heading)
          ? { heading: value.heading }
          : {}),
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
    case OP.CLIENT_UPDATE: {
      const value = decodeClientPositionRequest(payload);
      return value ? { type: "client_update", ...value } : null;
    }
    case OP.AUTO_ATTACK: {
      const value = decodeSidecar<{
        enabled?: unknown;
        targetId?: unknown;
      }>(SIDECAR_SCHEMA.AUTO_ATTACK, payload);
      const targetId = Number(value?.targetId);
      return value &&
        typeof value.enabled === "boolean" &&
        Number.isSafeInteger(targetId) &&
        targetId >= 0 &&
        targetId <= 0xffff_ffff
        ? { type: "auto_attack", enabled: value.enabled, targetId }
        : null;
    }
    case OP.LOOT_REQUEST: {
      const value = decodeSidecar<{ corpseId?: unknown }>(
        SIDECAR_SCHEMA.LOOT_REQUEST,
        payload,
      );
      const corpseId = Number(value?.corpseId);
      return Number.isSafeInteger(corpseId) && corpseId > 0
        ? { type: "loot_request", corpseId }
        : null;
    }
    case OP.LOOT_ITEM: {
      const value = decodeSidecar<{
        corpseId?: unknown;
        lootSlot?: unknown;
      }>(SIDECAR_SCHEMA.LOOT_ITEM, payload);
      const corpseId = Number(value?.corpseId);
      const lootSlot = Number(value?.lootSlot);
      return Number.isSafeInteger(corpseId) &&
        corpseId > 0 &&
        Number.isSafeInteger(lootSlot) &&
        lootSlot >= 0
        ? { type: "loot_item", corpseId, lootSlot }
        : null;
    }
    case OP.MERCHANT_OPEN: {
      const value = decodeSidecar<Record<string, unknown>>(
        SIDECAR_SCHEMA.MERCHANT_OPEN,
        payload,
      );
      return value
        ? { type: "merchant_open", npcId: number(value.npcId, 0) }
        : null;
    }
    case OP.MERCHANT_BUY: {
      const value = decodeSidecar<Record<string, unknown>>(
        SIDECAR_SCHEMA.MERCHANT_BUY,
        payload,
      );
      return value
        ? {
          type: "merchant_buy",
          npcId: number(value.npcId, 0),
          merchantSlot: number(value.merchantSlot, 0),
          quantity: number(value.quantity, 1),
        }
        : null;
    }
    case OP.MERCHANT_SELL: {
      const value = decodeSidecar<Record<string, unknown>>(
        SIDECAR_SCHEMA.MERCHANT_SELL,
        payload,
      );
      return value
        ? {
          type: "merchant_sell",
          npcId: number(value.npcId, 0),
          slot: number(value.slot, 0),
          bag: number(value.bag, -1),
          quantity: number(value.quantity, 1),
        }
        : null;
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
        targetName: String(
          value.targetName ?? value.targetname ?? value.target ?? "",
        ),
        message: String(value.message ?? ""),
        channel: number(value.chanNum, 0),
      };
    }
    case OP.JOURNAL_NOTE: {
      const value = decodeSidecar<Record<string, unknown>>(
        SIDECAR_SCHEMA.JOURNAL_NOTE,
        payload,
      );
      if (!value) return null;
      const action = String(value.action ?? "add");
      if (action !== "add" && action !== "remove" && action !== "pin") return null;
      return {
        type: "journal_note",
        action,
        body: String(value.body ?? ""),
        source: String(value.source ?? ""),
        noteId: number(value.noteId, 0),
        pinned: value.pinned === true,
        withPosition: value.withPosition === true,
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
      ? (event.value.spawns as WorldSpawnInput[])
      : [];
    return {
      opcode: OP.BATCH_ZONE_SPAWNS,
      payload: encodeWorldSpawnBatch(spawns),
      transport: event.transport ?? "control-stream",
    };
  }
  if (event.type === "render_snapshot") {
    const payload = event.value.payload;
    if (!(payload instanceof Uint8Array)) {
      throw new TypeError("render_snapshot event requires a Shado payload");
    }
    return {
      opcode: OP.RENDER_SNAPSHOT,
      payload,
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
  render_snapshot: [OP.RENDER_SNAPSHOT, SIDECAR_SCHEMA.SPAWNS],
  channel_message: [OP.CHANNEL_MESSAGE, SIDECAR_SCHEMA.CHANNEL],
  level_update: [OP.LEVEL_UPDATE, SIDECAR_SCHEMA.LEVEL],
  add_item: [OP.ADD_ITEM_PACKET, SIDECAR_SCHEMA.ITEM],
  bulk_items: [OP.ITEM_PACKET, SIDECAR_SCHEMA.BULK_ITEMS],
  delete_item: [OP.DELETE_ITEM, SIDECAR_SCHEMA.DELETE_ITEM],
  bulk_delete_items: [OP.BULK_DELETE_ITEMS, SIDECAR_SCHEMA.BULK_DELETE_ITEMS],
  move_item: [OP.MOVE_ITEM, SIDECAR_SCHEMA.MOVE_ITEM],
  combat_event: [OP.COMBAT_EVENT, SIDECAR_SCHEMA.COMBAT_EVENT],
  death_event: [OP.DEATH_EVENT, SIDECAR_SCHEMA.DEATH_EVENT],
  loot_window: [OP.LOOT_WINDOW, SIDECAR_SCHEMA.LOOT_WINDOW],
  loot_error: [OP.LOOT_ERROR, SIDECAR_SCHEMA.LOOT_ERROR],
  merchant_window: [OP.MERCHANT_WINDOW, SIDECAR_SCHEMA.MERCHANT_WINDOW],
  merchant_error: [OP.MERCHANT_ERROR, SIDECAR_SCHEMA.MERCHANT_ERROR],
  npc_debug_state: [OP.NPC_DEBUG_STATE, SIDECAR_SCHEMA.NPC_DEBUG_STATE],
  journal_update: [OP.JOURNAL_UPDATE, SIDECAR_SCHEMA.JOURNAL_UPDATE],
  experience_update: [OP.EXPERIENCE_UPDATE, SIDECAR_SCHEMA.EXPERIENCE_UPDATE],
};

function decodeZone(
  payload: Uint8Array,
  schema: number,
): { zoneId: number | string; instanceId: number } {
  const sidecar = decodeSidecar<{ zoneId?: unknown; instanceId?: unknown }>(
    schema,
    payload,
  );
  if (sidecar) {
    return {
      zoneId:
        typeof sidecar.zoneId === "string"
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
