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

type Events = {
  playerName: string;
  playerPosition: BJS.Vector3;
  playerRotation: BJS.Vector3;
  setPlayer: PlayerProfile;
  target: Entity | null;
  playerMovement: BJS.Vector3;
  viewportChanged: number[];
  chatMessage: ChatMessage;
  toggleInventory: void;
};

export const emitter: Emitter<Events> = mitt<Events>();
export default emitter;
