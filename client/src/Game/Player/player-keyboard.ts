import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";
import type Player from "./player";
import emitter from "@game/Events/events";
import type { Entity } from "@game/Model/entity";
import { CommandHandler } from "@game/ChatCommands/command-handler";
export class PlayerKeyboard {
  private player: Player;
  private scene: BJS.Scene;
  private handler: (kbInfo: BJS.KeyboardInfo) => void;
  private modifierKeys: { [key: string]: boolean } = {
    alt: false,
    ctrl: false,
    shift: false,
  };
  private closestEntities: Array<{ entity: Entity; dist: number }> = [];
  private currentSelectionIndex: number = -1;
  private boundHandler: (kbInfo: BJS.KeyboardInfo) => void;

  constructor(player: Player, scene: BJS.Scene) {
    this.player = player;
    this.scene = scene;
    this.handler = (kbInfo) => {
      if (kbInfo.event.repeat) {
        return; // Ignore repeated key events
      }
      const code = kbInfo.event.key.toLowerCase();
      switch (kbInfo.type) {
        case BABYLON.KeyboardEventTypes.KEYDOWN:
          this.handleKeyDownEvent(code);
          break;
        case BABYLON.KeyboardEventTypes.KEYUP:
          this.handleKeyUpEvent(code);
          break;
      }
      this.modifierKeys.alt = kbInfo.event.altKey;
      this.modifierKeys.ctrl = kbInfo.event.ctrlKey;
      this.modifierKeys.shift = kbInfo.event.shiftKey;
    };
    this.boundHandler = this.handler.bind(this);
    // Register keyboard listeners
    this.scene.onKeyboardObservable.add(this.boundHandler);
    emitter.on('playerMovement', this.resetIndex.bind(this)); // Reset index on player movement
  }

  private resetIndex() {
    this.currentSelectionIndex = -1; // Reset selection index
    this.closestEntities = []; // Clear closest entities
  }

  public dispose() {
    if (!this.scene.onKeyboardObservable.removeCallback(this.boundHandler)) {
      console.warn('Failed to remove keyboard handler from scene');
    }
    emitter.off('playerMovement', this.resetIndex);
    this.handler = () => {}; // Clear the handler to prevent memory leaks
  }

  private updateClosestEntities() {
    const entities = this.player.gameManager.ZoneManager?.EntityPool?.entities ?? {};
    const me = this.player.playerEntity;
    if (!me) {
      this.closestEntities = [];
      this.currentSelectionIndex = -1;
      return;
    }

    const myPos = me.spawnPosition;
    // Create an array of entities with their distances
    const entityDistances = Object.values(entities)
      .filter((entity) => !entity.hidden && entity !== me)
      .map((entity) => ({
        entity,
        dist: Math.sqrt(BABYLON.Vector3.DistanceSquared(myPos, entity.spawnPosition)),
      }))
      .filter((entry) => entry.dist <= 350) // Limit to 150 units
      .sort((a, b) => a.dist - b.dist) // Sort by distance
      .slice(0, 5); // Take the 5 closest

    this.closestEntities = entityDistances;
    // Reset selection index if it's out of bounds
    if (this.currentSelectionIndex >= this.closestEntities.length) {
      this.currentSelectionIndex = this.closestEntities.length > 0 ? 0 : -1;
    }
  }

  private handleKeyDownEvent(key: string) {
    switch (key) {
      case 'h': {
        CommandHandler.instance.commandHail();
        break;
      }
      case 'tab': {
        console.log("Tab key pressed");
        // Prevent default tab behavior (e.g., browser focus change)
        if (this.player.gameManager.ZoneManager?.EntityPool?.entities) {
          // Update the list of closest entities
          this.updateClosestEntities();

          if (this.closestEntities.length === 0) {
            console.log("No other entities found.");
            return;
          }

          // Cycle to the next entity
          const offset = this.modifierKeys.shift ? -1 : 1;
          this.currentSelectionIndex = (this.currentSelectionIndex + offset) % this.closestEntities.length;
          
          const selected = this.closestEntities[this.currentSelectionIndex];
          if (!selected) {
            this.currentSelectionIndex = -1; // Reset if no selection
            return;
          }
          this.player.Target = selected.entity;

        } else {
          console.log("No entities available.");
        }
        break;
      }
      case 'escape': {
        this.player.Target = null;
        this.currentSelectionIndex = -1; // Reset selection index
        break;
      }
      default:
        break;
    }
  }

  private handleKeyUpEvent(key: string) {
    switch (key) {
      default:
        break;
    }
  }
}