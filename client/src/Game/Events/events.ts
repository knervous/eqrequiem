import type { Entity } from '@game/Model/entity';
import type * as BJS from "@babylonjs/core";

import mitt, { Emitter } from 'mitt';

export type ChatMessage  = {
  type: number;
    message: string;
    chanNum: number;
    color: string;
}

type Events = {
  playerName: string;
  target: Entity | null;
  playerMovement: BJS.Vector3;
  viewportChanged: number[];
  chatMessage: ChatMessage;
};

export const emitter: Emitter<Events> = mitt<Events>();
export default emitter;