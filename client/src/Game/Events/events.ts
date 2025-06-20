import type { Entity } from '@game/Model/entity';
import type * as BJS from "@babylonjs/core";

import mitt, { Emitter } from 'mitt';

type Events = {
  playerName: string;
  target: Entity | null;
  playerMovement: BJS.Vector3;
};

export const emitter: Emitter<Events> = mitt<Events>();
export default emitter;