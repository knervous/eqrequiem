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

export const emitter: Emitter<Events> = mitt<Events>();
export default emitter;
