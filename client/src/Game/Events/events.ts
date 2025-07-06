import type { Entity } from "@game/Model/entity";
import type * as BJS from "@babylonjs/core";

import mitt, { Emitter } from "mitt";
import type { PlayerProfile } from "@game/Net/internal/api/capnp/player";

export type ChatMessage = {
  type: number;
  message: string;
  chanNum: number;
  color: string;
};

export type Events = {
  playerName: string;
  playerLoaded: void;
  zoneSpawns: void;
  playerPosition: BJS.Vector3;
  playerRotation: BJS.Vector3;
  setPlayer: PlayerProfile;
  target: Entity | null;
  playerMovement: BJS.Vector3;
  viewportChanged: number[];
  chatMessage: ChatMessage;
  toggleInventory: void;
  setMode: string;
};

type EnhancedEmitter<Events extends Record<string, unknown>> = Emitter<Events> & {
  once: <K extends keyof Events>(type: K, handler: (event: Events[K]) => void) => void;
};

export const emitter: EnhancedEmitter<Events> = mitt<Events>() as EnhancedEmitter<Events>;

emitter.once = <K extends keyof Events>(type: K, handler: (event: Events[K]) => void) => {
  const onceHandler = (event: Events[K]) => {
    handler(event);
    emitter.off(type, onceHandler);
  };
  emitter.on(type, onceHandler);
};

export default emitter;