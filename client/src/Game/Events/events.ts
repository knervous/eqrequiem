import type * as BJS from '@babylonjs/core';
import type { Config } from '@game/Config/types';
import type { Entity } from '@game/Model/entity';
import type { PlayerProfile } from '@game/Net/internal/api/capnp/player';
import type { InventorySlot } from '@game/Player/player-constants';
import type { BagState } from '@game/Player/player-inventory';
import type { JsonCommandLink } from '@ui/components/game/stone/middle/command-link-util';
import mitt, { Emitter } from 'mitt';

export type ChatMessage = {
  type: number;
  message: string;
  chanNum: number;
  color?: string;
};

export type Events = {
  playerName: string;
  playerLoaded: void;
  playerRunning: boolean;
  playerSitting: boolean;

  // Chat
  chatCommandLink: JsonCommandLink;

  // Updates
  levelUpdate: number;

  // Items/inventory
  updateInventory: void;
  updateInventorySlot: { slot: InventorySlot; bag?: number };
  updateBagState: { slot: InventorySlot; state: BagState };
  bagClick: number;

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

  // Config
  updateConfig: keyof Config | undefined;
  updateKeybinds: void;
  updateSettings: void;

  // Action buttons
  updateHotButtons: void;
  updateCombatButtons: void;
  updateSocialButtons: void;
  updateAbilityButtons: void;

  // Hotkey
  hotkey: number;
};

type EnhancedEmitter<Events extends Record<string, unknown>> =
  Emitter<Events> & {
    once: <K extends keyof Events>(
      type: K,
      handler: (event: Events[K]) => void,
    ) => void;
  };

export const emitter: EnhancedEmitter<Events> =
  mitt<Events>() as EnhancedEmitter<Events>;

emitter.once = <K extends keyof Events>(
  type: K,
  handler: (event: Events[K]) => void,
) => {
  const onceHandler = (event: Events[K]) => {
    handler(event);
    emitter.off(type, onceHandler);
  };
  emitter.on(type, onceHandler);
};

export default emitter;
