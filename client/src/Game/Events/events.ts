import type { Entity } from '@game/Model/entity';
import mitt, { Emitter } from 'mitt';

type Events = {
  playerName: string;
  target: Entity | null;
};

export const emitter: Emitter<Events> = mitt<Events>();
export default emitter;