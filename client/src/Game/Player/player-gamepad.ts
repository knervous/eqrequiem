// File: client/src/Game/Player/player-gamepad.ts
import { CommandHandler } from '@game/ChatCommands/command-handler';
import { UserConfig } from '@game/Config/config';
import {
  emptyGamepadSample,
  emptyMotionState,
  sampleGamepad,
  selectActiveGamepad,
  type ButtonSnapshot,
  type GamepadDigitalAction,
  type GamepadLike,
  type GamepadMotionState,
  type GamepadSample,
} from '@game/Config/gamepad-bindings';
import emitter from '@game/Events/events';
import { getWebHidGamepad } from './webhid-gamepad';
import type Player from './player';

/**
 * Polls the active controller every frame and forwards the result to the same
 * places the keyboard path uses. All of the mapping lives in `sampleGamepad`;
 * this class only owns device selection and dispatch.
 */
export class PlayerGamepad {
  private player: Player;
  private previousButtons: ButtonSnapshot = {};
  private activeIndex: number | null = null;
  private connectedId: string | null = null;
  private sample: GamepadSample = emptyGamepadSample();
  private motionState: GamepadMotionState = emptyMotionState();

  private readonly onConnected = (event: GamepadEvent) => {
    this.activeIndex = event.gamepad.index;
    this.connectedId = event.gamepad.id;
    emitter.emit('gamepadConnected', event.gamepad.id);
  };

  private readonly onDisconnected = (event: GamepadEvent) => {
    if (this.activeIndex !== event.gamepad.index) return;
    this.activeIndex = null;
    this.connectedId = null;
    this.reset();
    emitter.emit('gamepadConnected', null);
  };

  /**
   * Raw-HID fallback for controllers the Gamepad API refuses to enumerate,
   * notably the Switch Pro Controller over Bluetooth on macOS.
   */
  public readonly webHid = getWebHidGamepad();

  constructor(player: Player) {
    this.player = player;
    window.addEventListener('gamepadconnected', this.onConnected);
    window.addEventListener('gamepaddisconnected', this.onDisconnected);
    // Silently re-opens a controller the player has already approved.
    void this.webHid.restore();
  }

  public dispose() {
    window.removeEventListener('gamepadconnected', this.onConnected);
    window.removeEventListener('gamepaddisconnected', this.onDisconnected);
    // The HID device is owned by the session, not by one Player: zoning
    // recreates the player and must not drop the paired controller.
    this.reset();
    this.player = null as any;
  }

  public get connectedGamepadId(): string | null {
    return this.connectedId;
  }

  /** Analog movement for the current frame, consumed by PlayerMovement. */
  public get move() {
    return this.sample.move;
  }

  public get sprint() {
    return this.sample.sprint;
  }

  public get crouch() {
    return this.sample.crouch;
  }

  public get jump() {
    return this.sample.jump;
  }

  private reset() {
    this.sample = emptyGamepadSample();
    this.previousButtons = {};
    this.motionState = emptyMotionState();
  }

  /** The pad currently driving input, for the HUD and the options readout. */
  public get activeGamepad(): GamepadLike | null {
    const pads = navigator.getGamepads?.() as (GamepadLike | null)[] | null;
    return this.webHid.current ?? selectActiveGamepad(pads, this.activeIndex);
  }

  public tick(delta: number) {
    const config = UserConfig.instance.getConfig();
    if (!config.gamepad.enabled) {
      this.reset();
      return;
    }

    // A WebHID device wins: the player only pairs one when the Gamepad API
    // could not see their controller in the first place.
    const pads = navigator.getGamepads?.() as (GamepadLike | null)[] | null;
    const gamepad =
      this.webHid.current ?? selectActiveGamepad(pads, this.activeIndex);
    if (!gamepad) {
      this.reset();
      return;
    }
    if (typeof gamepad.index === 'number') this.activeIndex = gamepad.index;
    if (gamepad.id && gamepad.id !== this.connectedId) {
      this.connectedId = gamepad.id;
      emitter.emit('gamepadConnected', gamepad.id);
    }

    this.sample = sampleGamepad(
      gamepad,
      config.gamepadBindings,
      config.gamepad,
      this.previousButtons,
      delta,
      this.motionState,
    );
    this.previousButtons = this.sample.buttons;
    this.motionState = this.sample.motionState;

    const { look } = this.sample;
    if (look.x !== 0 || look.y !== 0) {
      this.player.playerCamera.inputGamepadLook(look.x, look.y);
    }
    for (const slot of this.sample.hotkeys) {
      emitter.emit('hotkey', slot);
    }
    for (const action of this.sample.actions) {
      this.runAction(action);
    }
  }

  private runAction(action: GamepadDigitalAction) {
    const commands = CommandHandler.instance();
    switch (action) {
      case 'inventory':
        emitter.emit('toggleInventory');
        break;
      case 'options':
        emitter.emit('toggleOptions');
        break;
      case 'autoAttack':
        this.player.autoAttack();
        break;
      case 'hail':
        commands.commandHail();
        break;
      case 'consider':
        commands.commandConsider();
        break;
      case 'camp':
        commands.commandCamp();
        break;
      case 'who':
        commands.commandWho();
        break;
      case 'invite':
        commands.commandInvite([]);
        break;
      case 'disband':
        commands.commandDisband();
        break;
      case 'help':
        commands.commandHelp();
        break;
      case 'sitStand':
        this.player.toggleSit();
        break;
      case 'autoRun':
        this.player.toggleAutoRun();
        break;
      case 'walkRun':
        this.player.Running = !this.player.Running;
        break;
      case 'targetNearest':
        this.player.playerKeyboard.cycleNearestTarget();
        break;
      case 'targetPrevious':
        this.player.playerKeyboard.cycleNearestTarget(true);
        break;
      case 'clearTarget':
        this.player.Target = null;
        break;
      // The client has no spellbook or reply target yet, on either input
      // path; the controller side is done and waiting for a consumer.
      case 'spells':
        emitter.emit('toggleSpells');
        break;
      case 'reply':
        emitter.emit('chatReply');
        break;
      case 'cameraToggle':
        this.player.playerCamera.toggleCameraPerspective();
        break;
      default:
        // jump/sprint/crouch/gyroHold/hotkeyModifier are polled as held
        // state, and hot buttons arrive through `hotkeys` instead.
        break;
    }
  }
}
