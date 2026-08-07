// File: client/src/Game/Config/config.ts
import emitter from "@game/Events/events";
import {
  ActionButtonData,
  ActionButtonType,
  ActionType,
} from "@ui/components/game/action-button/constants";
import {
  Config,
  GamepadBindings,
  GamepadSettings,
  HudWindowId,
  HudWindowPlacement,
  KeyBindings,
  Settings,
  UISettings,
} from "./types";

const configVersion = 5;
const configStoragePrefix = "eqrequiem:config:";
const opfsConfigDirectory = "eltania/config";
const legacyOpfsConfigDirectory = "eqrequiem/config";

export const DEFAULT_HUD_WINDOWS: UISettings["hudWindows"] = {
  player: { x: 0.014, y: 0.025, width: 230, height: 150, z: 2 },
  target: { x: 0.365, y: 0.105, width: 350, height: 104, z: 7 },
  compass: { x: 0.455, y: 0.018, width: 112, height: 46, z: 3 },
  minimap: { x: 0.81, y: 0.025, width: 230, height: 310, z: 4 },
  chat: { x: 0.014, y: 0.73, width: 440, height: 190, z: 5 },
  commands: { x: 0.445, y: 0.79, width: 690, height: 142, z: 6 },
};

/**
 * Standard-mapping defaults. Face buttons cover the verbs a player reaches for
 * mid-fight, the D-pad drives the first four hot buttons, and holding the left
 * bumper shifts the D-pad onto hot buttons five through eight.
 */
export const DEFAULT_GAMEPAD_BINDINGS: GamepadBindings = {
  moveAxisX: "Axis0",
  moveAxisY: "Axis1",
  lookAxisX: "Axis2",
  lookAxisY: "Axis3",

  jump: "Button0",
  sitStand: "Button1",
  hail: "Button2",
  consider: "Button3",
  hotkeyModifier: "Button4",
  targetNearest: "Button5",
  sprint: "Button6",
  autoAttack: "Button7",
  inventory: "Button8",
  options: "Button9",
  autoRun: "Button10",
  cameraToggle: "Button11",
  hotkey1: "Button12",
  hotkey2: "Button13",
  hotkey3: "Button14",
  hotkey4: "Button15",

  // Hot buttons five to eight are reachable by holding the shift with the
  // D-pad; these direct bindings exist so all ten can be assigned outright.
  hotkey5: "",
  hotkey6: "",
  hotkey7: "",
  hotkey8: "",
  hotkey9: "",
  hotkey10: "",

  // Reachable by binding, but left free so the defaults stay uncrowded.
  crouch: "",
  clearTarget: "",
  walkRun: "",
  targetPrevious: "",
  spells: "",
  reply: "",
  camp: "",
  who: "",
  invite: "",
  disband: "",
  help: "",
  gyroHold: "",
};

export const DEFAULT_GAMEPAD_SETTINGS: GamepadSettings = {
  enabled: true,
  // Tight enough to kill drift without swallowing slow, deliberate pushes.
  deadzone: 0.12,
  lookSensitivity: 1,
  invertLookY: false,
  invertMoveY: false,
  vibration: true,

  // A gentle curve plus a short ramp: precise for small corrections, and it
  // still spins around quickly when the stick is pinned for a moment.
  lookCurve: 1.7,
  lookAcceleration: 1.1,
  lookRampTime: 0.35,
  lookSmoothing: 0.055,
  moveSmoothing: 0.07,

  gyroEnabled: false,
  gyroSensitivity: 1,
  gyroInvertY: false,
  gyroRequiresHold: true,
};

export const DEFAULT_CONFIG: Config = {
  keyBindings: {
    moveForward: "W",
    moveBackward: "S",
    turnLeft: "A",
    turnRight: "D",
    sprint: "Shift",
    crouch: "Ctrl",
    hail: "H",
    consider: "C",
    jump: "Space",
    sitStand: "Ctrl+S",
    targetNearest: "Tab",
    targetPrevious: "Shift+Tab",
    inventory: "I",
    spells: "P",
    autoAttack: "T",
    options: "F10",

    // Chat
    reply: "R",
    // Misc
    autoRun: "Clear",

    // Hotkeys
    hotkey1: "1",
    hotkey2: "2",
    hotkey3: "3",
    hotkey4: "4",
    hotkey5: "5",
    hotkey6: "6",
    hotkey7: "7",
    hotkey8: "8",
    hotkey9: "9",
    hotkey10: "0",
  },
  gamepadBindings: structuredClone(DEFAULT_GAMEPAD_BINDINGS),
  gamepad: { ...DEFAULT_GAMEPAD_SETTINGS },
  settings: {
    particles: true,
    sound: true,
    music: true,
    musicVolume: 0.25,
    renderScale: 1,
  },
  ui: {
    theme: "default",
    fontSize: 14,
    showTooltips: true,
    uiScale: 1,
    hudLocked: false,
    hudWindows: structuredClone(DEFAULT_HUD_WINDOWS),
    controllerHud: true,
    controllerHudAutoHide: true,
  },
  hotButtons: {
    0: {
      type: ActionButtonType.MELEE_ATTACK,
      action: ActionType.MELEE_ATTACK,
      label: "Melee Attack",
      index: 0,
    },
    "1": {
      type: ActionButtonType.SOCIALS,
      action: ActionType.SOCIAL,
      label: "Hail",
      color: "#00FF00",
      data: ["/hail"],
      index: 0,
    },
    "2": {
      type: 12,
    },
    "3": {
      type: ActionButtonType.SOCIALS,
      action: ActionType.SOCIAL,
      label: "Consider",
      color: "#FFFF00",
      data: ["/consider"],
      index: 1,
    },
    "4": {
      type: 8,
    },
    "5": {
      type: 13,
    },
    "9": {
      type: 11,
    },
  },
  combatButtons: {
    0: {
      type: ActionButtonType.MELEE_ATTACK,
      action: ActionType.MELEE_ATTACK,
      label: "Melee Attack",
    },
    1: {
      type: ActionButtonType.RANGED_ATTACK,
      action: ActionType.RANGED_ATTACK,
      label: "Ranged Attack",
    },
  },
  socialButtons: {
    0: {
      type: ActionButtonType.SOCIALS,
      action: ActionType.SOCIAL,
      label: "Hail",
      color: "#00FF00",
      data: ["/hail"],
    },
    1: {
      type: ActionButtonType.SOCIALS,
      action: ActionType.SOCIAL,
      label: "Consider",
      color: "#FFFF00",
      data: ["/consider"],
    },
    2: {
      type: ActionButtonType.SOCIALS,
      action: ActionType.SOCIAL,
      label: "Afk",
      color: "#FF00FF",
      data: ["/afk"],
    },
  },
  abilityButtons: {},
};

export function mergeConfig(configData: Partial<Config> | null): Config {
  return {
    keyBindings: {
      ...DEFAULT_CONFIG.keyBindings,
      ...configData?.keyBindings,
    },
    gamepadBindings: {
      ...DEFAULT_CONFIG.gamepadBindings,
      ...configData?.gamepadBindings,
    },
    gamepad: {
      ...DEFAULT_CONFIG.gamepad,
      ...configData?.gamepad,
    },
    settings: {
      ...DEFAULT_CONFIG.settings,
      ...configData?.settings,
    },
    ui: {
      ...DEFAULT_CONFIG.ui,
      ...configData?.ui,
      hudWindows: {
        ...DEFAULT_CONFIG.ui.hudWindows,
        ...configData?.ui?.hudWindows,
      },
    },
    hotButtons: {
      ...DEFAULT_CONFIG.hotButtons,
      ...configData?.hotButtons,
    },
    combatButtons: {
      ...DEFAULT_CONFIG.combatButtons,
      ...configData?.combatButtons,
    },
    socialButtons: {
      ...DEFAULT_CONFIG.socialButtons,
      ...configData?.socialButtons,
    },
    abilityButtons: {
      ...DEFAULT_CONFIG.abilityButtons,
      ...configData?.abilityButtons,
    },
  };
}

export class UserConfig {
  private static instance_: UserConfig;
  private config: Config;
  private configFilePath = "";

  private async getOpfsConfigHandle(
    create: boolean,
    directoryPath = opfsConfigDirectory,
  ): Promise<FileSystemFileHandle | null> {
    if (!navigator.storage?.getDirectory || !this.configFilePath) return null;
    const root = await navigator.storage.getDirectory();
    let directory: FileSystemDirectoryHandle = root;
    for (const segment of directoryPath.split("/")) {
      directory = await directory.getDirectoryHandle(segment, { create });
    }
    return directory.getFileHandle(this.configFilePath, { create });
  }

  private async readOpfsConfig(
    directoryPath = opfsConfigDirectory,
  ): Promise<Partial<Config> | null> {
    try {
      const handle = await this.getOpfsConfigHandle(false, directoryPath);
      if (!handle) return null;
      const file = await handle.getFile();
      const text = await file.text();
      return text ? (JSON.parse(text) as Partial<Config>) : null;
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") {
        return null;
      }
      console.warn(
        `Failed to read OPFS config ${directoryPath}/${this.configFilePath}:`,
        error,
      );
      return null;
    }
  }

  private async writeOpfsConfig(serialized: string): Promise<void> {
    const handle = await this.getOpfsConfigHandle(true);
    if (!handle) return;
    const writable = await handle.createWritable();
    await writable.write(serialized);
    await writable.close();
  }

  private constructor() {
    this.config = DEFAULT_CONFIG;
    emitter.on("updateConfig", this.updateConfigEvent.bind(this));
  }

  private updateConfigEvent(key?: keyof Config): void {
    switch (key) {
      case "keyBindings":
        emitter.emit("updateKeybinds");
        break;
      case "gamepadBindings":
      case "gamepad":
        emitter.emit("updateGamepad");
        break;
      case "settings":
        emitter.emit("updateSettings");
        break;
      case "ui":
        emitter.emit("updateUI");
        break;
      case "hotButtons":
        emitter.emit("updateHotButtons");
        break;
      case "combatButtons":
        emitter.emit("updateCombatButtons");
        break;
      case "socialButtons":
        emitter.emit("updateSocialButtons");
        break;
      case "abilityButtons":
        emitter.emit("updateAbilityButtons");
        break;
      default:
        emitter.emit("updateSettings");
        emitter.emit("updateUI");
        emitter.emit("updateKeybinds");
        emitter.emit("updateGamepad");
        emitter.emit("updateHotButtons");
        emitter.emit("updateCombatButtons");
        emitter.emit("updateSocialButtons");
        emitter.emit("updateAbilityButtons");
    }
  }

  public async initialize(server: string, player: string): Promise<void> {
    this.configFilePath = `${server}_${player}_${configVersion}.json`;
    let configData = await this.readOpfsConfig();
    if (!configData) {
      configData = await this.readOpfsConfig(legacyOpfsConfigDirectory);
    }
    try {
      if (!configData) {
        const stored = localStorage.getItem(
          `${configStoragePrefix}${this.configFilePath}`,
        );
        configData = stored ? (JSON.parse(stored) as Partial<Config>) : null;
      }
    } catch (error) {
      console.error(`Failed to load config ${this.configFilePath}:`, error);
    }
    console.log("Config data", configData);
    this.config = mergeConfig(configData);
    emitter.emit("updateConfig");
    this.save();
  }

  public swapHotButtons(index1: number, index2: number = index1 + 1): void {
    const temp = this.config.hotButtons[index1];
    this.config.hotButtons[index1] = this.config.hotButtons[index2];
    if (temp !== undefined) {
      this.config.hotButtons[index2] = temp;
    } else {
      delete this.config.hotButtons[index2];
    }
    emitter.emit("updateConfig", "hotButtons");
    this.save();
  }

  public updateHotButton(index: number, actionButton: ActionButtonData | null) {
    if (actionButton) {
      this.config.hotButtons[index] = actionButton;
    } else {
      delete this.config.hotButtons[index];
    }
    emitter.emit("updateConfig", "hotButtons");
    this.save();
  }

  public updateCombatButton(
    index: number,
    actionButton: ActionButtonData | null,
  ) {
    if (actionButton) {
      this.config.combatButtons[index] = actionButton;
    } else {
      delete this.config.combatButtons[index];
    }
    emitter.emit("updateConfig", "combatButtons");
    this.save();
  }

  public updateSocialButton(
    index: number,
    actionButton: ActionButtonData | null,
  ) {
    if (actionButton) {
      this.config.socialButtons[index] = actionButton;
    } else {
      delete this.config.socialButtons[index];
    }
    emitter.emit("updateConfig", "socialButtons");
    this.save();
  }

  public updateAbilityButton(
    index: number,
    actionButton: ActionButtonData | null,
  ) {
    if (actionButton) {
      this.config.abilityButtons[index] = actionButton;
    } else {
      delete this.config.abilityButtons[index];
    }
    emitter.emit("updateConfig", "abilityButtons");
    this.save();
  }

  public updateKeybind(key: keyof KeyBindings, value: string): void {
    this.config.keyBindings[key] = value;
    emitter.emit("updateConfig", "keyBindings");
    this.save();
  }

  public resetKeybinds(): void {
    this.config.keyBindings = { ...DEFAULT_CONFIG.keyBindings };
    emitter.emit("updateConfig", "keyBindings");
    this.save();
  }

  public updateGamepadBinding(
    key: keyof GamepadBindings,
    value: string,
  ): void {
    this.config.gamepadBindings[key] = value;
    emitter.emit("updateConfig", "gamepadBindings");
    this.save();
  }

  public resetGamepadBindings(): void {
    this.config.gamepadBindings = structuredClone(DEFAULT_GAMEPAD_BINDINGS);
    emitter.emit("updateConfig", "gamepadBindings");
    this.save();
  }

  public updateGamepadSetting<K extends keyof GamepadSettings>(
    key: K,
    value: GamepadSettings[K],
  ): void {
    this.config.gamepad[key] = value;
    emitter.emit("updateConfig", "gamepad");
    this.save();
  }

  public updateSetting<K extends keyof Settings>(
    key: K,
    value: Settings[K],
  ): void {
    this.config.settings[key] = value;
    emitter.emit("updateConfig", "settings");
    this.save();
  }

  public updateUISetting<K extends keyof UISettings>(
    key: K,
    value: UISettings[K],
  ): void {
    this.config.ui[key] = value;
    emitter.emit("updateConfig", "ui");
    this.save();
  }

  public updateHudWindow(
    key: HudWindowId,
    placement: HudWindowPlacement,
  ): void {
    this.config.ui.hudWindows[key] = placement;
    emitter.emit("updateConfig", "ui");
    this.save();
  }

  public resetHudWindows(): void {
    this.config.ui.hudWindows = structuredClone(DEFAULT_HUD_WINDOWS);
    emitter.emit("updateConfig", "ui");
    this.save();
  }
  private saveTimeout: NodeJS.Timeout | null = null;

  private save(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(async () => {
      try {
        const serialized = JSON.stringify(this.config);
        await this.writeOpfsConfig(serialized);
        localStorage.setItem(
          `${configStoragePrefix}${this.configFilePath}`,
          serialized,
        );
        console.log(`Config saved to OPFS: ${this.configFilePath}`);
      } catch (error) {
        console.error(`Failed to save config ${this.configFilePath}:`, error);
      }
      this.saveTimeout = null;
    }, 300);
  }

  public static get instance(): UserConfig {
    if (!UserConfig.instance_) {
      UserConfig.instance_ = new UserConfig();
    }
    return UserConfig.instance_;
  }

  public getConfig(): Config {
    return this.config;
  }

  public get<K extends keyof Config>(key: K): Config[K] {
    return this.config[key];
  }

  public set<K extends keyof Config>(key: K, value: Config[K]): void {
    this.config[key] = value;
  }

  public reset(): void {
    this.config = mergeConfig(null);
    emitter.emit("updateConfig");
    this.save();
  }
}

globalThis.UserConfig = UserConfig.instance;
