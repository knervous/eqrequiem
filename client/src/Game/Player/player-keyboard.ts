import type * as BJS from "@babylonjs/core";
import BABYLON from "@bjs";
import { CommandHandler } from "@game/ChatCommands/command-handler";
import { UserConfig } from "@game/Config/config";
import { keyboardEventToBinding } from "@game/Config/key-bindings";
import emitter from "@game/Events/events";
import type { Entity } from "@game/Model/entity";
import type Player from "./player";

export class PlayerKeyboard {
  private player: Player;
  private scene: BJS.Scene;
  private handler: (kbInfo: BJS.KeyboardInfo) => void;
  public modifierKeys: { [key: string]: boolean } = {
    alt: false,
    ctrl: false,
    shift: false,
  };
  private closestEntities: Array<{ entity: Entity; dist: number }> = [];
  private currentSelectionIndex: number = -1;
  private boundHandler: (kbInfo: BJS.KeyboardInfo) => void;
  private readonly movementResetHandler = () => this.resetIndex();

  constructor(player: Player, scene: BJS.Scene) {
    this.player = player;
    this.scene = scene;
    this.handler = (kbInfo) => {
      if ((kbInfo.event as KeyboardEvent).repeat) {
        return;
      }
      this.modifierKeys.alt = kbInfo.event.altKey;
      this.modifierKeys.ctrl = kbInfo.event.ctrlKey;
      this.modifierKeys.shift = kbInfo.event.shiftKey;
      this.modifierKeys.meta = kbInfo.event.metaKey;
      const code = keyboardEventToBinding(kbInfo.event as KeyboardEvent);
      switch (kbInfo.type) {
        case BABYLON.KeyboardEventTypes.KEYDOWN:
          this.handleKeyDownEvent(code);
          break;
        case BABYLON.KeyboardEventTypes.KEYUP:
          this.handleKeyUpEvent(code);
          break;
        default:
          break;
      }
    };
    this.boundHandler = this.handler.bind(this);
    // Register keyboard listeners
    this.scene.onKeyboardObservable.add(this.boundHandler);
    emitter.on("playerMovement", this.movementResetHandler);
  }

  private resetIndex() {
    this.currentSelectionIndex = -1; // Reset selection index
    this.closestEntities = []; // Clear closest entities
  }

  public dispose() {
    if (!this.scene.onKeyboardObservable.removeCallback(this.boundHandler)) {
      console.warn("Failed to remove keyboard handler from scene");
    }
    emitter.off("playerMovement", this.movementResetHandler);
    this.handler = () => {}; // Clear the handler to prevent memory leaks
  }

  private updateClosestEntities() {
    const entities =
      this.player.gameManager.ZoneManager?.EntityPool?.entities ?? {};
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
        dist: Math.sqrt(
          BABYLON.Vector3.DistanceSquared(myPos, entity.spawnPosition),
        ),
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

  /**
   * Advances the target ring to the next closest entity. Shared by the target
   * key binding and the controller's target button.
   */
  public cycleNearestTarget(backwards: boolean = false) {
    if (!this.player.gameManager.ZoneManager?.EntityPool?.entities) {
      return;
    }
    this.updateClosestEntities();
    if (this.closestEntities.length === 0) {
      return;
    }
    const offset = backwards ? -1 : 1;
    this.currentSelectionIndex =
      (this.currentSelectionIndex + offset + this.closestEntities.length) %
      this.closestEntities.length;

    const selected = this.closestEntities[this.currentSelectionIndex];
    if (!selected) {
      this.currentSelectionIndex = -1;
      return;
    }
    this.player.Target = selected.entity;
  }

  private handleKeyDownEvent(key: string) {
    const keyBindings = UserConfig.instance.getConfig().keyBindings;

    // The contextual prompt claims its keys first, so walking up to a merchant
    // and pressing H hails them rather than your distant target. When no
    // prompt is showing the generic bindings below still apply.
    if (
      keyBindings.interactPrimary &&
      key.toLowerCase() === keyBindings.interactPrimary.toLowerCase() &&
      this.player.interactions.trigger('primary')
    ) {
      return;
    }
    if (
      keyBindings.interactSecondary &&
      key.toLowerCase() === keyBindings.interactSecondary.toLowerCase() &&
      this.player.interactions.trigger('secondary')
    ) {
      return;
    }

    switch (key.toLowerCase()) {
      case keyBindings.inventory.toLowerCase(): {
        emitter.emit("toggleInventory");
        break;
      }
      case keyBindings.autoAttack.toLowerCase(): {
        this.player.autoAttack();
        break;
      }
      case keyBindings.hail.toLowerCase(): {
        CommandHandler.instance().commandHail();
        break;
      }
      case keyBindings.sitStand.toLowerCase(): {
        this.player.toggleSit();
        break;
      }
      case keyBindings.autoRun.toLowerCase(): {
        this.player.toggleAutoRun();
        break;
      }
      case keyBindings.targetNearest.toLowerCase(): {
        this.cycleNearestTarget(this.modifierKeys.shift);
        break;
      }

      case keyBindings.hotkey1.toLowerCase(): {
        emitter.emit("hotkey", 0);
        break;
      }
      case keyBindings.hotkey2.toLowerCase(): {
        emitter.emit("hotkey", 1);
        break;
      }
      case keyBindings.hotkey3.toLowerCase(): {
        emitter.emit("hotkey", 2);
        break;
      }
      case keyBindings.hotkey4.toLowerCase(): {
        emitter.emit("hotkey", 3);
        break;
      }
      case keyBindings.hotkey5.toLowerCase(): {
        emitter.emit("hotkey", 4);
        break;
      }
      case keyBindings.hotkey6.toLowerCase(): {
        emitter.emit("hotkey", 5);
        break;
      }
      case keyBindings.hotkey7.toLowerCase(): {
        emitter.emit("hotkey", 6);
        break;
      }
      case keyBindings.hotkey8.toLowerCase(): {
        emitter.emit("hotkey", 7);
        break;
      }
      case keyBindings.hotkey9.toLowerCase(): {
        emitter.emit("hotkey", 8);
        break;
      }
      case keyBindings.hotkey10.toLowerCase(): {
        emitter.emit("hotkey", 9);
        break;
      }

      case "escape": {
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
