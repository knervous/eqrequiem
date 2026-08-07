"use strict";
(() => {
  // node_modules/mitt/dist/mitt.mjs
  function mitt_default(n) {
    return { all: n = n || /* @__PURE__ */ new Map(), on: function(t, e) {
      var i = n.get(t);
      i ? i.push(e) : n.set(t, [e]);
    }, off: function(t, e) {
      var i = n.get(t);
      i && (e ? i.splice(i.indexOf(e) >>> 0, 1) : n.set(t, []));
    }, emit: function(t, e) {
      var i = n.get(t);
      i && i.slice().map(function(n2) {
        n2(e);
      }), (i = n.get("*")) && i.slice().map(function(n2) {
        n2(t, e);
      });
    } };
  }

  // src/Game/Events/events.ts
  var emitter = mitt_default();
  emitter.once = (type, handler) => {
    const onceHandler = (event) => {
      handler(event);
      emitter.off(type, onceHandler);
    };
    emitter.on(type, onceHandler);
  };
  var events_default = emitter;

  // src/Game/Config/config.ts
  var configVersion = 5;
  var configStoragePrefix = "eqrequiem:config:";
  var opfsConfigDirectory = "eltania/config";
  var legacyOpfsConfigDirectory = "eqrequiem/config";
  var DEFAULT_HUD_WINDOWS = {
    player: { x: 0.014, y: 0.025, width: 230, height: 150, z: 2 },
    target: { x: 0.365, y: 0.105, width: 350, height: 104, z: 7 },
    compass: { x: 0.455, y: 0.018, width: 112, height: 46, z: 3 },
    minimap: { x: 0.81, y: 0.025, width: 230, height: 310, z: 4 },
    chat: { x: 0.014, y: 0.73, width: 440, height: 190, z: 5 },
    commands: { x: 0.445, y: 0.79, width: 690, height: 142, z: 6 }
  };
  var DEFAULT_GAMEPAD_BINDINGS = {
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
    crouch: "",
    clearTarget: ""
  };
  var DEFAULT_GAMEPAD_SETTINGS = {
    enabled: true,
    deadzone: 0.18,
    lookSensitivity: 1,
    invertLookY: false,
    invertMoveY: false,
    vibration: true
  };
  var DEFAULT_CONFIG = {
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
      hotkey10: "0"
    },
    gamepadBindings: structuredClone(DEFAULT_GAMEPAD_BINDINGS),
    gamepad: { ...DEFAULT_GAMEPAD_SETTINGS },
    settings: {
      particles: true,
      sound: true,
      music: true,
      musicVolume: 0.25,
      renderScale: 1
    },
    ui: {
      theme: "default",
      fontSize: 14,
      showTooltips: true,
      uiScale: 1,
      hudLocked: false,
      hudWindows: structuredClone(DEFAULT_HUD_WINDOWS)
    },
    hotButtons: {
      0: {
        type: 14 /* MELEE_ATTACK */,
        action: 0 /* MELEE_ATTACK */,
        label: "Melee Attack",
        index: 0
      },
      "1": {
        type: 2 /* SOCIALS */,
        action: 4 /* SOCIAL */,
        label: "Hail",
        color: "#00FF00",
        data: ["/hail"],
        index: 0
      },
      "2": {
        type: 12
      },
      "3": {
        type: 2 /* SOCIALS */,
        action: 4 /* SOCIAL */,
        label: "Consider",
        color: "#FFFF00",
        data: ["/consider"],
        index: 1
      },
      "4": {
        type: 8
      },
      "5": {
        type: 13
      },
      "9": {
        type: 11
      }
    },
    combatButtons: {
      0: {
        type: 14 /* MELEE_ATTACK */,
        action: 0 /* MELEE_ATTACK */,
        label: "Melee Attack"
      },
      1: {
        type: 15 /* RANGED_ATTACK */,
        action: 1 /* RANGED_ATTACK */,
        label: "Ranged Attack"
      }
    },
    socialButtons: {
      0: {
        type: 2 /* SOCIALS */,
        action: 4 /* SOCIAL */,
        label: "Hail",
        color: "#00FF00",
        data: ["/hail"]
      },
      1: {
        type: 2 /* SOCIALS */,
        action: 4 /* SOCIAL */,
        label: "Consider",
        color: "#FFFF00",
        data: ["/consider"]
      },
      2: {
        type: 2 /* SOCIALS */,
        action: 4 /* SOCIAL */,
        label: "Afk",
        color: "#FF00FF",
        data: ["/afk"]
      }
    },
    abilityButtons: {}
  };
  function mergeConfig(configData) {
    return {
      keyBindings: {
        ...DEFAULT_CONFIG.keyBindings,
        ...configData?.keyBindings
      },
      gamepadBindings: {
        ...DEFAULT_CONFIG.gamepadBindings,
        ...configData?.gamepadBindings
      },
      gamepad: {
        ...DEFAULT_CONFIG.gamepad,
        ...configData?.gamepad
      },
      settings: {
        ...DEFAULT_CONFIG.settings,
        ...configData?.settings
      },
      ui: {
        ...DEFAULT_CONFIG.ui,
        ...configData?.ui,
        hudWindows: {
          ...DEFAULT_CONFIG.ui.hudWindows,
          ...configData?.ui?.hudWindows
        }
      },
      hotButtons: {
        ...DEFAULT_CONFIG.hotButtons,
        ...configData?.hotButtons
      },
      combatButtons: {
        ...DEFAULT_CONFIG.combatButtons,
        ...configData?.combatButtons
      },
      socialButtons: {
        ...DEFAULT_CONFIG.socialButtons,
        ...configData?.socialButtons
      },
      abilityButtons: {
        ...DEFAULT_CONFIG.abilityButtons,
        ...configData?.abilityButtons
      }
    };
  }
  var UserConfig = class _UserConfig {
    static instance_;
    config;
    configFilePath = "";
    async getOpfsConfigHandle(create, directoryPath = opfsConfigDirectory) {
      if (!navigator.storage?.getDirectory || !this.configFilePath) return null;
      const root = await navigator.storage.getDirectory();
      let directory = root;
      for (const segment of directoryPath.split("/")) {
        directory = await directory.getDirectoryHandle(segment, { create });
      }
      return directory.getFileHandle(this.configFilePath, { create });
    }
    async readOpfsConfig(directoryPath = opfsConfigDirectory) {
      try {
        const handle = await this.getOpfsConfigHandle(false, directoryPath);
        if (!handle) return null;
        const file = await handle.getFile();
        const text = await file.text();
        return text ? JSON.parse(text) : null;
      } catch (error) {
        if (error instanceof DOMException && error.name === "NotFoundError") {
          return null;
        }
        console.warn(
          `Failed to read OPFS config ${directoryPath}/${this.configFilePath}:`,
          error
        );
        return null;
      }
    }
    async writeOpfsConfig(serialized) {
      const handle = await this.getOpfsConfigHandle(true);
      if (!handle) return;
      const writable = await handle.createWritable();
      await writable.write(serialized);
      await writable.close();
    }
    constructor() {
      this.config = DEFAULT_CONFIG;
      events_default.on("updateConfig", this.updateConfigEvent.bind(this));
    }
    updateConfigEvent(key) {
      switch (key) {
        case "keyBindings":
          events_default.emit("updateKeybinds");
          break;
        case "gamepadBindings":
        case "gamepad":
          events_default.emit("updateGamepad");
          break;
        case "settings":
          events_default.emit("updateSettings");
          break;
        case "ui":
          events_default.emit("updateUI");
          break;
        case "hotButtons":
          events_default.emit("updateHotButtons");
          break;
        case "combatButtons":
          events_default.emit("updateCombatButtons");
          break;
        case "socialButtons":
          events_default.emit("updateSocialButtons");
          break;
        case "abilityButtons":
          events_default.emit("updateAbilityButtons");
          break;
        default:
          events_default.emit("updateSettings");
          events_default.emit("updateUI");
          events_default.emit("updateKeybinds");
          events_default.emit("updateGamepad");
          events_default.emit("updateHotButtons");
          events_default.emit("updateCombatButtons");
          events_default.emit("updateSocialButtons");
          events_default.emit("updateAbilityButtons");
      }
    }
    async initialize(server, player) {
      this.configFilePath = `${server}_${player}_${configVersion}.json`;
      let configData = await this.readOpfsConfig();
      if (!configData) {
        configData = await this.readOpfsConfig(legacyOpfsConfigDirectory);
      }
      try {
        if (!configData) {
          const stored = localStorage.getItem(
            `${configStoragePrefix}${this.configFilePath}`
          );
          configData = stored ? JSON.parse(stored) : null;
        }
      } catch (error) {
        console.error(`Failed to load config ${this.configFilePath}:`, error);
      }
      console.log("Config data", configData);
      this.config = mergeConfig(configData);
      events_default.emit("updateConfig");
      this.save();
    }
    swapHotButtons(index1, index2 = index1 + 1) {
      const temp = this.config.hotButtons[index1];
      this.config.hotButtons[index1] = this.config.hotButtons[index2];
      if (temp !== void 0) {
        this.config.hotButtons[index2] = temp;
      } else {
        delete this.config.hotButtons[index2];
      }
      events_default.emit("updateConfig", "hotButtons");
      this.save();
    }
    updateHotButton(index, actionButton) {
      if (actionButton) {
        this.config.hotButtons[index] = actionButton;
      } else {
        delete this.config.hotButtons[index];
      }
      events_default.emit("updateConfig", "hotButtons");
      this.save();
    }
    updateCombatButton(index, actionButton) {
      if (actionButton) {
        this.config.combatButtons[index] = actionButton;
      } else {
        delete this.config.combatButtons[index];
      }
      events_default.emit("updateConfig", "combatButtons");
      this.save();
    }
    updateSocialButton(index, actionButton) {
      if (actionButton) {
        this.config.socialButtons[index] = actionButton;
      } else {
        delete this.config.socialButtons[index];
      }
      events_default.emit("updateConfig", "socialButtons");
      this.save();
    }
    updateAbilityButton(index, actionButton) {
      if (actionButton) {
        this.config.abilityButtons[index] = actionButton;
      } else {
        delete this.config.abilityButtons[index];
      }
      events_default.emit("updateConfig", "abilityButtons");
      this.save();
    }
    updateKeybind(key, value) {
      this.config.keyBindings[key] = value;
      events_default.emit("updateConfig", "keyBindings");
      this.save();
    }
    resetKeybinds() {
      this.config.keyBindings = { ...DEFAULT_CONFIG.keyBindings };
      events_default.emit("updateConfig", "keyBindings");
      this.save();
    }
    updateGamepadBinding(key, value) {
      this.config.gamepadBindings[key] = value;
      events_default.emit("updateConfig", "gamepadBindings");
      this.save();
    }
    resetGamepadBindings() {
      this.config.gamepadBindings = structuredClone(DEFAULT_GAMEPAD_BINDINGS);
      events_default.emit("updateConfig", "gamepadBindings");
      this.save();
    }
    updateGamepadSetting(key, value) {
      this.config.gamepad[key] = value;
      events_default.emit("updateConfig", "gamepad");
      this.save();
    }
    updateSetting(key, value) {
      this.config.settings[key] = value;
      events_default.emit("updateConfig", "settings");
      this.save();
    }
    updateUISetting(key, value) {
      this.config.ui[key] = value;
      events_default.emit("updateConfig", "ui");
      this.save();
    }
    updateHudWindow(key, placement) {
      this.config.ui.hudWindows[key] = placement;
      events_default.emit("updateConfig", "ui");
      this.save();
    }
    resetHudWindows() {
      this.config.ui.hudWindows = structuredClone(DEFAULT_HUD_WINDOWS);
      events_default.emit("updateConfig", "ui");
      this.save();
    }
    saveTimeout = null;
    save() {
      if (this.saveTimeout) {
        clearTimeout(this.saveTimeout);
      }
      this.saveTimeout = setTimeout(async () => {
        try {
          const serialized = JSON.stringify(this.config);
          await this.writeOpfsConfig(serialized);
          localStorage.setItem(
            `${configStoragePrefix}${this.configFilePath}`,
            serialized
          );
          console.log(`Config saved to OPFS: ${this.configFilePath}`);
        } catch (error) {
          console.error(`Failed to save config ${this.configFilePath}:`, error);
        }
        this.saveTimeout = null;
      }, 300);
    }
    static get instance() {
      if (!_UserConfig.instance_) {
        _UserConfig.instance_ = new _UserConfig();
      }
      return _UserConfig.instance_;
    }
    getConfig() {
      return this.config;
    }
    get(key) {
      return this.config[key];
    }
    set(key, value) {
      this.config[key] = value;
    }
    reset() {
      this.config = mergeConfig(null);
      events_default.emit("updateConfig");
      this.save();
    }
  };
  globalThis.UserConfig = UserConfig.instance;

  // src/Game/Config/gamepad-bindings.ts
  var GAMEPAD_BUTTON_LABELS = [
    "A / Cross",
    "B / Circle",
    "X / Square",
    "Y / Triangle",
    "Left Bumper",
    "Right Bumper",
    "Left Trigger",
    "Right Trigger",
    "Back / Share",
    "Start / Options",
    "Left Stick Click",
    "Right Stick Click",
    "D-Pad Up",
    "D-Pad Down",
    "D-Pad Left",
    "D-Pad Right",
    "Guide"
  ];
  var GAMEPAD_AXIS_LABELS = [
    "Left Stick X",
    "Left Stick Y",
    "Right Stick X",
    "Right Stick Y"
  ];
  var BUTTON_PRESS_THRESHOLD = 0.5;
  var AXIS_CAPTURE_THRESHOLD = 0.6;
  var gamepadButtonBinding = (index) => `Button${index}`;
  var gamepadAxisBinding = (index) => `Axis${index}`;
  var presentGamepadBinding = (binding) => {
    if (!binding) return "Unbound";
    const button = /^Button(\d+)$/.exec(binding);
    if (button) {
      const index = Number(button[1]);
      return GAMEPAD_BUTTON_LABELS[index] ?? `Button ${index}`;
    }
    const axis = /^Axis(\d+)$/.exec(binding);
    if (axis) {
      const index = Number(axis[1]);
      return GAMEPAD_AXIS_LABELS[index] ?? `Axis ${index}`;
    }
    return binding;
  };
  var parseButtonBinding = (binding) => {
    const match = /^Button(\d+)$/.exec(binding ?? "");
    return match ? Number(match[1]) : null;
  };
  var parseAxisBinding = (binding) => {
    const match = /^Axis(\d+)$/.exec(binding ?? "");
    return match ? Number(match[1]) : null;
  };
  var applyDeadzone = (value, deadzone) => {
    if (!Number.isFinite(value)) return 0;
    const limit = Math.min(Math.max(deadzone, 0), 0.95);
    const magnitude = Math.abs(value);
    if (magnitude <= limit) return 0;
    const scaled = (magnitude - limit) / (1 - limit);
    return Math.sign(value) * Math.min(1, scaled);
  };
  var applyStickDeadzone = (x, y, deadzone) => {
    const safeX = Number.isFinite(x) ? x : 0;
    const safeY = Number.isFinite(y) ? y : 0;
    const magnitude = Math.hypot(safeX, safeY);
    if (magnitude === 0) return { x: 0, y: 0 };
    const scaled = applyDeadzone(magnitude, deadzone);
    if (scaled === 0) return { x: 0, y: 0 };
    return { x: safeX / magnitude * scaled, y: safeY / magnitude * scaled };
  };
  var isButtonPressed = (gamepad, index) => {
    if (!gamepad || index === null || index < 0) return false;
    const button = gamepad.buttons?.[index];
    if (!button) return false;
    if (button.pressed) return true;
    return (button.value ?? 0) >= BUTTON_PRESS_THRESHOLD;
  };
  var readAxis = (gamepad, index) => {
    if (!gamepad || index === null || index < 0) return 0;
    const value = gamepad.axes?.[index];
    return Number.isFinite(value) ? value : 0;
  };
  var snapshotButtons = (gamepad) => {
    const snapshot = {};
    const buttons = gamepad?.buttons ?? [];
    for (let index = 0; index < buttons.length; index++) {
      snapshot[index] = isButtonPressed(gamepad, index);
    }
    return snapshot;
  };
  var risingEdges = (previous, current) => {
    const pressed = [];
    for (const [key, value] of Object.entries(current)) {
      if (value && !previous[Number(key)]) pressed.push(Number(key));
    }
    return pressed;
  };
  var detectGamepadBinding = (gamepad, options = {}) => {
    if (!gamepad) return null;
    const buttons = gamepad.buttons ?? [];
    for (let index = 0; index < buttons.length; index++) {
      if (isButtonPressed(gamepad, index)) return gamepadButtonBinding(index);
    }
    if (options.allowAxes) {
      const threshold = options.axisThreshold ?? AXIS_CAPTURE_THRESHOLD;
      const axes = gamepad.axes ?? [];
      for (let index = 0; index < axes.length; index++) {
        if (Math.abs(axes[index] ?? 0) >= threshold) {
          return gamepadAxisBinding(index);
        }
      }
    }
    return null;
  };
  var LOOK_PIXELS_PER_SECOND = 900;
  var HOTKEY_ACTIONS = [
    "hotkey1",
    "hotkey2",
    "hotkey3",
    "hotkey4"
  ];
  var HOTKEY_MODIFIER_OFFSET = 4;
  var emptyGamepadSample = () => ({
    move: { forward: 0, strafe: 0 },
    look: { x: 0, y: 0 },
    sprint: false,
    crouch: false,
    jump: false,
    actions: [],
    hotkeys: [],
    buttons: {}
  });
  var sampleGamepad = (gamepad, bindings, settings, previousButtons, delta) => {
    if (!gamepad) return emptyGamepadSample();
    const stick = applyStickDeadzone(
      readAxis(gamepad, parseAxisBinding(bindings.moveAxisX)),
      readAxis(gamepad, parseAxisBinding(bindings.moveAxisY)),
      settings.deadzone
    );
    const lookX = applyDeadzone(
      readAxis(gamepad, parseAxisBinding(bindings.lookAxisX)),
      settings.deadzone
    );
    const lookY = applyDeadzone(
      readAxis(gamepad, parseAxisBinding(bindings.lookAxisY)),
      settings.deadzone
    );
    const lookScale = LOOK_PIXELS_PER_SECOND * settings.lookSensitivity * delta;
    const scaledLookY = Math.sign(lookY) * lookY * lookY * lookScale;
    const held = (action) => isButtonPressed(gamepad, parseButtonBinding(bindings[action]));
    const buttons = snapshotButtons(gamepad);
    const pressed = risingEdges(previousButtons, buttons);
    const modifierHeld = held("hotkeyModifier");
    const actions = [];
    const hotkeys = [];
    for (const button of pressed) {
      const hotkeySlot = HOTKEY_ACTIONS.findIndex(
        (action) => parseButtonBinding(bindings[action]) === button
      );
      if (hotkeySlot >= 0) {
        hotkeys.push(
          modifierHeld ? hotkeySlot + HOTKEY_MODIFIER_OFFSET : hotkeySlot
        );
        continue;
      }
      for (const [action, binding] of Object.entries(bindings)) {
        if (parseButtonBinding(binding) === button) {
          actions.push(action);
        }
      }
    }
    return {
      move: {
        forward: settings.invertMoveY ? -stick.y : stick.y,
        strafe: stick.x
      },
      look: {
        x: Math.sign(lookX) * lookX * lookX * lookScale,
        y: settings.invertLookY ? -scaledLookY : scaledLookY
      },
      sprint: held("sprint"),
      crouch: held("crouch"),
      jump: held("jump"),
      actions,
      hotkeys,
      buttons
    };
  };
  var selectActiveGamepad = (gamepads, preferredIndex = null) => {
    const list = gamepads ?? [];
    if (preferredIndex !== null) {
      const preferred = list[preferredIndex];
      if (preferred && preferred.connected !== false) return preferred;
    }
    for (const gamepad of list) {
      if (gamepad && gamepad.connected !== false) return gamepad;
    }
    return null;
  };

  // e2e/harness/gamepad-harness.ts
  var bindingsWith = (overrides) => ({
    ...DEFAULT_GAMEPAD_BINDINGS,
    ...overrides?.bindings
  });
  var settingsWith = (overrides) => ({
    ...DEFAULT_GAMEPAD_SETTINGS,
    ...overrides?.settings
  });
  var replay = (frames, overrides, delta = 1 / 60) => {
    const bindings = bindingsWith(overrides);
    const settings = settingsWith(overrides);
    let previous = {};
    return frames.map((frame) => {
      const sample = sampleGamepad(frame, bindings, settings, previous, delta);
      previous = sample.buttons;
      return sample;
    });
  };
  var harness = {
    applyDeadzone,
    applyStickDeadzone,
    detectGamepadBinding,
    emptyGamepadSample,
    presentGamepadBinding,
    selectActiveGamepad,
    defaults: {
      bindings: DEFAULT_GAMEPAD_BINDINGS,
      settings: DEFAULT_GAMEPAD_SETTINGS
    },
    sample: (gamepad, overrides, previous = {}, delta = 1 / 60) => sampleGamepad(
      gamepad,
      bindingsWith(overrides),
      settingsWith(overrides),
      previous,
      delta
    ),
    replay,
    /** Reads whatever `navigator.getGamepads()` currently reports. */
    poll: (overrides, previous = {}, delta = 1 / 60) => sampleGamepad(
      selectActiveGamepad(
        Array.from(navigator.getGamepads?.() ?? [])
      ),
      bindingsWith(overrides),
      settingsWith(overrides),
      previous,
      delta
    )
  };
  window.gamepadHarness = harness;
  var gamepad_harness_default = harness;
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vbm9kZV9tb2R1bGVzL21pdHQvc3JjL2luZGV4LnRzIiwgIi4uLy4uL3NyYy9HYW1lL0V2ZW50cy9ldmVudHMudHMiLCAiLi4vLi4vc3JjL0dhbWUvQ29uZmlnL2NvbmZpZy50cyIsICIuLi8uLi9zcmMvR2FtZS9Db25maWcvZ2FtZXBhZC1iaW5kaW5ncy50cyIsICIuLi9oYXJuZXNzL2dhbWVwYWQtaGFybmVzcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiZXhwb3J0IHR5cGUgRXZlbnRUeXBlID0gc3RyaW5nIHwgc3ltYm9sO1xuXG4vLyBBbiBldmVudCBoYW5kbGVyIGNhbiB0YWtlIGFuIG9wdGlvbmFsIGV2ZW50IGFyZ3VtZW50XG4vLyBhbmQgc2hvdWxkIG5vdCByZXR1cm4gYSB2YWx1ZVxuZXhwb3J0IHR5cGUgSGFuZGxlcjxUID0gdW5rbm93bj4gPSAoZXZlbnQ6IFQpID0+IHZvaWQ7XG5leHBvcnQgdHlwZSBXaWxkY2FyZEhhbmRsZXI8VCA9IFJlY29yZDxzdHJpbmcsIHVua25vd24+PiA9IChcblx0dHlwZToga2V5b2YgVCxcblx0ZXZlbnQ6IFRba2V5b2YgVF1cbikgPT4gdm9pZDtcblxuLy8gQW4gYXJyYXkgb2YgYWxsIGN1cnJlbnRseSByZWdpc3RlcmVkIGV2ZW50IGhhbmRsZXJzIGZvciBhIHR5cGVcbmV4cG9ydCB0eXBlIEV2ZW50SGFuZGxlckxpc3Q8VCA9IHVua25vd24+ID0gQXJyYXk8SGFuZGxlcjxUPj47XG5leHBvcnQgdHlwZSBXaWxkQ2FyZEV2ZW50SGFuZGxlckxpc3Q8VCA9IFJlY29yZDxzdHJpbmcsIHVua25vd24+PiA9IEFycmF5PFxuXHRXaWxkY2FyZEhhbmRsZXI8VD5cbj47XG5cbi8vIEEgbWFwIG9mIGV2ZW50IHR5cGVzIGFuZCB0aGVpciBjb3JyZXNwb25kaW5nIGV2ZW50IGhhbmRsZXJzLlxuZXhwb3J0IHR5cGUgRXZlbnRIYW5kbGVyTWFwPEV2ZW50cyBleHRlbmRzIFJlY29yZDxFdmVudFR5cGUsIHVua25vd24+PiA9IE1hcDxcblx0a2V5b2YgRXZlbnRzIHwgJyonLFxuXHRFdmVudEhhbmRsZXJMaXN0PEV2ZW50c1trZXlvZiBFdmVudHNdPiB8IFdpbGRDYXJkRXZlbnRIYW5kbGVyTGlzdDxFdmVudHM+XG4+O1xuXG5leHBvcnQgaW50ZXJmYWNlIEVtaXR0ZXI8RXZlbnRzIGV4dGVuZHMgUmVjb3JkPEV2ZW50VHlwZSwgdW5rbm93bj4+IHtcblx0YWxsOiBFdmVudEhhbmRsZXJNYXA8RXZlbnRzPjtcblxuXHRvbjxLZXkgZXh0ZW5kcyBrZXlvZiBFdmVudHM+KHR5cGU6IEtleSwgaGFuZGxlcjogSGFuZGxlcjxFdmVudHNbS2V5XT4pOiB2b2lkO1xuXHRvbih0eXBlOiAnKicsIGhhbmRsZXI6IFdpbGRjYXJkSGFuZGxlcjxFdmVudHM+KTogdm9pZDtcblxuXHRvZmY8S2V5IGV4dGVuZHMga2V5b2YgRXZlbnRzPihcblx0XHR0eXBlOiBLZXksXG5cdFx0aGFuZGxlcj86IEhhbmRsZXI8RXZlbnRzW0tleV0+XG5cdCk6IHZvaWQ7XG5cdG9mZih0eXBlOiAnKicsIGhhbmRsZXI6IFdpbGRjYXJkSGFuZGxlcjxFdmVudHM+KTogdm9pZDtcblxuXHRlbWl0PEtleSBleHRlbmRzIGtleW9mIEV2ZW50cz4odHlwZTogS2V5LCBldmVudDogRXZlbnRzW0tleV0pOiB2b2lkO1xuXHRlbWl0PEtleSBleHRlbmRzIGtleW9mIEV2ZW50cz4oXG5cdFx0dHlwZTogdW5kZWZpbmVkIGV4dGVuZHMgRXZlbnRzW0tleV0gPyBLZXkgOiBuZXZlclxuXHQpOiB2b2lkO1xufVxuXG4vKipcbiAqIE1pdHQ6IFRpbnkgKH4yMDBiKSBmdW5jdGlvbmFsIGV2ZW50IGVtaXR0ZXIgLyBwdWJzdWIuXG4gKiBAbmFtZSBtaXR0XG4gKiBAcmV0dXJucyB7TWl0dH1cbiAqL1xuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gbWl0dDxFdmVudHMgZXh0ZW5kcyBSZWNvcmQ8RXZlbnRUeXBlLCB1bmtub3duPj4oXG5cdGFsbD86IEV2ZW50SGFuZGxlck1hcDxFdmVudHM+XG4pOiBFbWl0dGVyPEV2ZW50cz4ge1xuXHR0eXBlIEdlbmVyaWNFdmVudEhhbmRsZXIgPVxuXHRcdHwgSGFuZGxlcjxFdmVudHNba2V5b2YgRXZlbnRzXT5cblx0XHR8IFdpbGRjYXJkSGFuZGxlcjxFdmVudHM+O1xuXHRhbGwgPSBhbGwgfHwgbmV3IE1hcCgpO1xuXG5cdHJldHVybiB7XG5cdFx0LyoqXG5cdFx0ICogQSBNYXAgb2YgZXZlbnQgbmFtZXMgdG8gcmVnaXN0ZXJlZCBoYW5kbGVyIGZ1bmN0aW9ucy5cblx0XHQgKi9cblx0XHRhbGwsXG5cblx0XHQvKipcblx0XHQgKiBSZWdpc3RlciBhbiBldmVudCBoYW5kbGVyIGZvciB0aGUgZ2l2ZW4gdHlwZS5cblx0XHQgKiBAcGFyYW0ge3N0cmluZ3xzeW1ib2x9IHR5cGUgVHlwZSBvZiBldmVudCB0byBsaXN0ZW4gZm9yLCBvciBgJyonYCBmb3IgYWxsIGV2ZW50c1xuXHRcdCAqIEBwYXJhbSB7RnVuY3Rpb259IGhhbmRsZXIgRnVuY3Rpb24gdG8gY2FsbCBpbiByZXNwb25zZSB0byBnaXZlbiBldmVudFxuXHRcdCAqIEBtZW1iZXJPZiBtaXR0XG5cdFx0ICovXG5cdFx0b248S2V5IGV4dGVuZHMga2V5b2YgRXZlbnRzPih0eXBlOiBLZXksIGhhbmRsZXI6IEdlbmVyaWNFdmVudEhhbmRsZXIpIHtcblx0XHRcdGNvbnN0IGhhbmRsZXJzOiBBcnJheTxHZW5lcmljRXZlbnRIYW5kbGVyPiB8IHVuZGVmaW5lZCA9IGFsbCEuZ2V0KHR5cGUpO1xuXHRcdFx0aWYgKGhhbmRsZXJzKSB7XG5cdFx0XHRcdGhhbmRsZXJzLnB1c2goaGFuZGxlcik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhbGwhLnNldCh0eXBlLCBbaGFuZGxlcl0gYXMgRXZlbnRIYW5kbGVyTGlzdDxFdmVudHNba2V5b2YgRXZlbnRzXT4pO1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHQvKipcblx0XHQgKiBSZW1vdmUgYW4gZXZlbnQgaGFuZGxlciBmb3IgdGhlIGdpdmVuIHR5cGUuXG5cdFx0ICogSWYgYGhhbmRsZXJgIGlzIG9taXR0ZWQsIGFsbCBoYW5kbGVycyBvZiB0aGUgZ2l2ZW4gdHlwZSBhcmUgcmVtb3ZlZC5cblx0XHQgKiBAcGFyYW0ge3N0cmluZ3xzeW1ib2x9IHR5cGUgVHlwZSBvZiBldmVudCB0byB1bnJlZ2lzdGVyIGBoYW5kbGVyYCBmcm9tIChgJyonYCB0byByZW1vdmUgYSB3aWxkY2FyZCBoYW5kbGVyKVxuXHRcdCAqIEBwYXJhbSB7RnVuY3Rpb259IFtoYW5kbGVyXSBIYW5kbGVyIGZ1bmN0aW9uIHRvIHJlbW92ZVxuXHRcdCAqIEBtZW1iZXJPZiBtaXR0XG5cdFx0ICovXG5cdFx0b2ZmPEtleSBleHRlbmRzIGtleW9mIEV2ZW50cz4odHlwZTogS2V5LCBoYW5kbGVyPzogR2VuZXJpY0V2ZW50SGFuZGxlcikge1xuXHRcdFx0Y29uc3QgaGFuZGxlcnM6IEFycmF5PEdlbmVyaWNFdmVudEhhbmRsZXI+IHwgdW5kZWZpbmVkID0gYWxsIS5nZXQodHlwZSk7XG5cdFx0XHRpZiAoaGFuZGxlcnMpIHtcblx0XHRcdFx0aWYgKGhhbmRsZXIpIHtcblx0XHRcdFx0XHRoYW5kbGVycy5zcGxpY2UoaGFuZGxlcnMuaW5kZXhPZihoYW5kbGVyKSA+Pj4gMCwgMSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YWxsIS5zZXQodHlwZSwgW10pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdC8qKlxuXHRcdCAqIEludm9rZSBhbGwgaGFuZGxlcnMgZm9yIHRoZSBnaXZlbiB0eXBlLlxuXHRcdCAqIElmIHByZXNlbnQsIGAnKidgIGhhbmRsZXJzIGFyZSBpbnZva2VkIGFmdGVyIHR5cGUtbWF0Y2hlZCBoYW5kbGVycy5cblx0XHQgKlxuXHRcdCAqIE5vdGU6IE1hbnVhbGx5IGZpcmluZyAnKicgaGFuZGxlcnMgaXMgbm90IHN1cHBvcnRlZC5cblx0XHQgKlxuXHRcdCAqIEBwYXJhbSB7c3RyaW5nfHN5bWJvbH0gdHlwZSBUaGUgZXZlbnQgdHlwZSB0byBpbnZva2Vcblx0XHQgKiBAcGFyYW0ge0FueX0gW2V2dF0gQW55IHZhbHVlIChvYmplY3QgaXMgcmVjb21tZW5kZWQgYW5kIHBvd2VyZnVsKSwgcGFzc2VkIHRvIGVhY2ggaGFuZGxlclxuXHRcdCAqIEBtZW1iZXJPZiBtaXR0XG5cdFx0ICovXG5cdFx0ZW1pdDxLZXkgZXh0ZW5kcyBrZXlvZiBFdmVudHM+KHR5cGU6IEtleSwgZXZ0PzogRXZlbnRzW0tleV0pIHtcblx0XHRcdGxldCBoYW5kbGVycyA9IGFsbCEuZ2V0KHR5cGUpO1xuXHRcdFx0aWYgKGhhbmRsZXJzKSB7XG5cdFx0XHRcdChoYW5kbGVycyBhcyBFdmVudEhhbmRsZXJMaXN0PEV2ZW50c1trZXlvZiBFdmVudHNdPilcblx0XHRcdFx0XHQuc2xpY2UoKVxuXHRcdFx0XHRcdC5tYXAoKGhhbmRsZXIpID0+IHtcblx0XHRcdFx0XHRcdGhhbmRsZXIoZXZ0ISk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGhhbmRsZXJzID0gYWxsIS5nZXQoJyonKTtcblx0XHRcdGlmIChoYW5kbGVycykge1xuXHRcdFx0XHQoaGFuZGxlcnMgYXMgV2lsZENhcmRFdmVudEhhbmRsZXJMaXN0PEV2ZW50cz4pXG5cdFx0XHRcdFx0LnNsaWNlKClcblx0XHRcdFx0XHQubWFwKChoYW5kbGVyKSA9PiB7XG5cdFx0XHRcdFx0XHRoYW5kbGVyKHR5cGUsIGV2dCEpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fTtcbn1cbiIsICJpbXBvcnQgdHlwZSAqIGFzIEJKUyBmcm9tICdAYmFieWxvbmpzL2NvcmUnO1xuaW1wb3J0IHR5cGUgeyBDb25maWcgfSBmcm9tICdAZ2FtZS9Db25maWcvdHlwZXMnO1xuaW1wb3J0IHR5cGUgeyBFbnRpdHkgfSBmcm9tICdAZ2FtZS9Nb2RlbC9lbnRpdHknO1xuaW1wb3J0IHR5cGUgeyBQbGF5ZXJQcm9maWxlIH0gZnJvbSAnQGdhbWUvTmV0L21lc3NhZ2VzJztcbmltcG9ydCB0eXBlIHtcbiAgQ29tYmF0RXZlbnQsXG4gIERlYXRoRXZlbnQsXG4gIExvb3RXaW5kb3csXG4gIE1lcmNoYW50V2luZG93LFxuICBOcGNEZWJ1Z1N0YXRlLFxufSBmcm9tICdAZ2FtZS9OZXQvbWVzc2FnZXMnO1xuaW1wb3J0IHR5cGUgeyBJbnZlbnRvcnlTbG90IH0gZnJvbSAnQGdhbWUvUGxheWVyL3BsYXllci1jb25zdGFudHMnO1xuaW1wb3J0IHR5cGUgeyBCYWdTdGF0ZSB9IGZyb20gJ0BnYW1lL1BsYXllci9wbGF5ZXItaW52ZW50b3J5JztcbmltcG9ydCB0eXBlIHsgSnNvbkNvbW1hbmRMaW5rIH0gZnJvbSAnQHVpL2NvbXBvbmVudHMvZ2FtZS9jaGF0L2NvbW1hbmQtbGluay11dGlsJztcbmltcG9ydCBtaXR0LCB7IEVtaXR0ZXIgfSBmcm9tICdtaXR0JztcblxuZXhwb3J0IHR5cGUgQ2hhdE1lc3NhZ2UgPSB7XG4gIHR5cGU6IG51bWJlcjtcbiAgbWVzc2FnZTogc3RyaW5nO1xuICBjaGFuTnVtOiBudW1iZXI7XG4gIGNvbG9yPzogc3RyaW5nO1xufTtcblxuZXhwb3J0IHR5cGUgRXZlbnRzID0ge1xuICBwbGF5ZXJOYW1lOiBzdHJpbmc7XG4gIHBsYXllckxvYWRlZDogdm9pZDtcbiAgcGxheWVyUnVubmluZzogYm9vbGVhbjtcbiAgcGxheWVyU2l0dGluZzogYm9vbGVhbjtcblxuICAvLyBDaGF0XG4gIGNoYXRDb21tYW5kTGluazogSnNvbkNvbW1hbmRMaW5rO1xuXG4gIC8vIFVwZGF0ZXNcbiAgbGV2ZWxVcGRhdGU6IG51bWJlcjtcblxuICAvLyBJdGVtcy9pbnZlbnRvcnlcbiAgdXBkYXRlSW52ZW50b3J5OiB2b2lkO1xuICB1cGRhdGVJbnZlbnRvcnlTbG90OiB7IHNsb3Q6IEludmVudG9yeVNsb3Q7IGJhZz86IG51bWJlciB9O1xuICB1cGRhdGVCYWdTdGF0ZTogeyBzbG90OiBJbnZlbnRvcnlTbG90OyBzdGF0ZTogQmFnU3RhdGUgfTtcbiAgYmFnQ2xpY2s6IG51bWJlcjtcblxuICAvKiogV29ybGQgY2xvY2sgaW4gaG91cnMsIDAtMjQuIEVtaXR0ZWQgYnkgdGhlIHNreSBtYW5hZ2VyIGFzIHRoZSBkYXkgYWR2YW5jZXMuICovXG4gIHRpbWVPZkRheTogbnVtYmVyO1xuXG4gIHpvbmVTcGF3bnM6IHZvaWQ7XG4gIHBsYXllclBvc2l0aW9uOiBCSlMuVmVjdG9yMztcbiAgcGxheWVyUm90YXRpb246IEJKUy5WZWN0b3IzO1xuICBzZXRQbGF5ZXI6IFBsYXllclByb2ZpbGU7XG4gIHRhcmdldDogRW50aXR5IHwgbnVsbDtcbiAgYXV0b0F0dGFjazogYm9vbGVhbjtcbiAgY29tYmF0RXZlbnQ6IENvbWJhdEV2ZW50O1xuICBwbGF5ZXJEZWF0aDogRGVhdGhFdmVudDtcbiAgbG9vdFdpbmRvdzogTG9vdFdpbmRvdyB8IG51bGw7XG4gIG1lcmNoYW50V2luZG93OiBNZXJjaGFudFdpbmRvdyB8IG51bGw7XG4gIG5wY0RlYnVnU3RhdGU6IE5wY0RlYnVnU3RhdGU7XG4gIGVudGl0eUhlYWx0aDoge1xuICAgIHNwYXduSWQ6IG51bWJlcjtcbiAgICBjdXJyZW50SHA6IG51bWJlcjtcbiAgICBtYXhpbXVtSHA6IG51bWJlcjtcbiAgfTtcbiAgcGxheWVyTW92ZW1lbnQ6IEJKUy5WZWN0b3IzO1xuICB2aWV3cG9ydENoYW5nZWQ6IG51bWJlcltdO1xuICBjaGF0TWVzc2FnZTogQ2hhdE1lc3NhZ2U7XG4gIHRvZ2dsZUludmVudG9yeTogdm9pZDtcbiAgdG9nZ2xlT3B0aW9uczogdm9pZDtcbiAgc2V0TW9kZTogc3RyaW5nO1xuXG4gIC8vIENvbmZpZ1xuICB1cGRhdGVDb25maWc6IGtleW9mIENvbmZpZyB8IHVuZGVmaW5lZDtcbiAgdXBkYXRlS2V5YmluZHM6IHZvaWQ7XG4gIHVwZGF0ZUdhbWVwYWQ6IHZvaWQ7XG4gIC8qKiBFbWl0dGVkIHdoZW4gYSBjb250cm9sbGVyIGNvbm5lY3RzIG9yIGRpc2Nvbm5lY3RzLCB3aXRoIGl0cyBpZCBvciBudWxsLiAqL1xuICBnYW1lcGFkQ29ubmVjdGVkOiBzdHJpbmcgfCBudWxsO1xuICB1cGRhdGVTZXR0aW5nczogdm9pZDtcbiAgdXBkYXRlVUk6IHZvaWQ7XG5cbiAgLy8gQWN0aW9uIGJ1dHRvbnNcbiAgdXBkYXRlSG90QnV0dG9uczogdm9pZDtcbiAgdXBkYXRlQ29tYmF0QnV0dG9uczogdm9pZDtcbiAgdXBkYXRlU29jaWFsQnV0dG9uczogdm9pZDtcbiAgdXBkYXRlQWJpbGl0eUJ1dHRvbnM6IHZvaWQ7XG5cbiAgLy8gSG90a2V5XG4gIGhvdGtleTogbnVtYmVyO1xufTtcblxudHlwZSBFbmhhbmNlZEVtaXR0ZXI8RXZlbnRzIGV4dGVuZHMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4+ID1cbiAgRW1pdHRlcjxFdmVudHM+ICYge1xuICAgIG9uY2U6IDxLIGV4dGVuZHMga2V5b2YgRXZlbnRzPihcbiAgICAgIHR5cGU6IEssXG4gICAgICBoYW5kbGVyOiAoZXZlbnQ6IEV2ZW50c1tLXSkgPT4gdm9pZCxcbiAgICApID0+IHZvaWQ7XG4gIH07XG5cbmV4cG9ydCBjb25zdCBlbWl0dGVyOiBFbmhhbmNlZEVtaXR0ZXI8RXZlbnRzPiA9XG4gIG1pdHQ8RXZlbnRzPigpIGFzIEVuaGFuY2VkRW1pdHRlcjxFdmVudHM+O1xuXG5lbWl0dGVyLm9uY2UgPSA8SyBleHRlbmRzIGtleW9mIEV2ZW50cz4oXG4gIHR5cGU6IEssXG4gIGhhbmRsZXI6IChldmVudDogRXZlbnRzW0tdKSA9PiB2b2lkLFxuKSA9PiB7XG4gIGNvbnN0IG9uY2VIYW5kbGVyID0gKGV2ZW50OiBFdmVudHNbS10pID0+IHtcbiAgICBoYW5kbGVyKGV2ZW50KTtcbiAgICBlbWl0dGVyLm9mZih0eXBlLCBvbmNlSGFuZGxlcik7XG4gIH07XG4gIGVtaXR0ZXIub24odHlwZSwgb25jZUhhbmRsZXIpO1xufTtcblxuZXhwb3J0IGRlZmF1bHQgZW1pdHRlcjtcbiIsICIvLyBGaWxlOiBjbGllbnQvc3JjL0dhbWUvQ29uZmlnL2NvbmZpZy50c1xuaW1wb3J0IGVtaXR0ZXIgZnJvbSBcIkBnYW1lL0V2ZW50cy9ldmVudHNcIjtcbmltcG9ydCB7XG4gIEFjdGlvbkJ1dHRvbkRhdGEsXG4gIEFjdGlvbkJ1dHRvblR5cGUsXG4gIEFjdGlvblR5cGUsXG59IGZyb20gXCJAdWkvY29tcG9uZW50cy9nYW1lL2FjdGlvbi1idXR0b24vY29uc3RhbnRzXCI7XG5pbXBvcnQge1xuICBDb25maWcsXG4gIEdhbWVwYWRCaW5kaW5ncyxcbiAgR2FtZXBhZFNldHRpbmdzLFxuICBIdWRXaW5kb3dJZCxcbiAgSHVkV2luZG93UGxhY2VtZW50LFxuICBLZXlCaW5kaW5ncyxcbiAgU2V0dGluZ3MsXG4gIFVJU2V0dGluZ3MsXG59IGZyb20gXCIuL3R5cGVzXCI7XG5cbmNvbnN0IGNvbmZpZ1ZlcnNpb24gPSA1O1xuY29uc3QgY29uZmlnU3RvcmFnZVByZWZpeCA9IFwiZXFyZXF1aWVtOmNvbmZpZzpcIjtcbmNvbnN0IG9wZnNDb25maWdEaXJlY3RvcnkgPSBcImVsdGFuaWEvY29uZmlnXCI7XG5jb25zdCBsZWdhY3lPcGZzQ29uZmlnRGlyZWN0b3J5ID0gXCJlcXJlcXVpZW0vY29uZmlnXCI7XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX0hVRF9XSU5ET1dTOiBVSVNldHRpbmdzW1wiaHVkV2luZG93c1wiXSA9IHtcbiAgcGxheWVyOiB7IHg6IDAuMDE0LCB5OiAwLjAyNSwgd2lkdGg6IDIzMCwgaGVpZ2h0OiAxNTAsIHo6IDIgfSxcbiAgdGFyZ2V0OiB7IHg6IDAuMzY1LCB5OiAwLjEwNSwgd2lkdGg6IDM1MCwgaGVpZ2h0OiAxMDQsIHo6IDcgfSxcbiAgY29tcGFzczogeyB4OiAwLjQ1NSwgeTogMC4wMTgsIHdpZHRoOiAxMTIsIGhlaWdodDogNDYsIHo6IDMgfSxcbiAgbWluaW1hcDogeyB4OiAwLjgxLCB5OiAwLjAyNSwgd2lkdGg6IDIzMCwgaGVpZ2h0OiAzMTAsIHo6IDQgfSxcbiAgY2hhdDogeyB4OiAwLjAxNCwgeTogMC43Mywgd2lkdGg6IDQ0MCwgaGVpZ2h0OiAxOTAsIHo6IDUgfSxcbiAgY29tbWFuZHM6IHsgeDogMC40NDUsIHk6IDAuNzksIHdpZHRoOiA2OTAsIGhlaWdodDogMTQyLCB6OiA2IH0sXG59O1xuXG4vKipcbiAqIFN0YW5kYXJkLW1hcHBpbmcgZGVmYXVsdHMuIEZhY2UgYnV0dG9ucyBjb3ZlciB0aGUgdmVyYnMgYSBwbGF5ZXIgcmVhY2hlcyBmb3JcbiAqIG1pZC1maWdodCwgdGhlIEQtcGFkIGRyaXZlcyB0aGUgZmlyc3QgZm91ciBob3QgYnV0dG9ucywgYW5kIGhvbGRpbmcgdGhlIGxlZnRcbiAqIGJ1bXBlciBzaGlmdHMgdGhlIEQtcGFkIG9udG8gaG90IGJ1dHRvbnMgZml2ZSB0aHJvdWdoIGVpZ2h0LlxuICovXG5leHBvcnQgY29uc3QgREVGQVVMVF9HQU1FUEFEX0JJTkRJTkdTOiBHYW1lcGFkQmluZGluZ3MgPSB7XG4gIG1vdmVBeGlzWDogXCJBeGlzMFwiLFxuICBtb3ZlQXhpc1k6IFwiQXhpczFcIixcbiAgbG9va0F4aXNYOiBcIkF4aXMyXCIsXG4gIGxvb2tBeGlzWTogXCJBeGlzM1wiLFxuXG4gIGp1bXA6IFwiQnV0dG9uMFwiLFxuICBzaXRTdGFuZDogXCJCdXR0b24xXCIsXG4gIGhhaWw6IFwiQnV0dG9uMlwiLFxuICBjb25zaWRlcjogXCJCdXR0b24zXCIsXG4gIGhvdGtleU1vZGlmaWVyOiBcIkJ1dHRvbjRcIixcbiAgdGFyZ2V0TmVhcmVzdDogXCJCdXR0b241XCIsXG4gIHNwcmludDogXCJCdXR0b242XCIsXG4gIGF1dG9BdHRhY2s6IFwiQnV0dG9uN1wiLFxuICBpbnZlbnRvcnk6IFwiQnV0dG9uOFwiLFxuICBvcHRpb25zOiBcIkJ1dHRvbjlcIixcbiAgYXV0b1J1bjogXCJCdXR0b24xMFwiLFxuICBjYW1lcmFUb2dnbGU6IFwiQnV0dG9uMTFcIixcbiAgaG90a2V5MTogXCJCdXR0b24xMlwiLFxuICBob3RrZXkyOiBcIkJ1dHRvbjEzXCIsXG4gIGhvdGtleTM6IFwiQnV0dG9uMTRcIixcbiAgaG90a2V5NDogXCJCdXR0b24xNVwiLFxuICBjcm91Y2g6IFwiXCIsXG4gIGNsZWFyVGFyZ2V0OiBcIlwiLFxufTtcblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfR0FNRVBBRF9TRVRUSU5HUzogR2FtZXBhZFNldHRpbmdzID0ge1xuICBlbmFibGVkOiB0cnVlLFxuICBkZWFkem9uZTogMC4xOCxcbiAgbG9va1NlbnNpdGl2aXR5OiAxLFxuICBpbnZlcnRMb29rWTogZmFsc2UsXG4gIGludmVydE1vdmVZOiBmYWxzZSxcbiAgdmlicmF0aW9uOiB0cnVlLFxufTtcblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfQ09ORklHOiBDb25maWcgPSB7XG4gIGtleUJpbmRpbmdzOiB7XG4gICAgbW92ZUZvcndhcmQ6IFwiV1wiLFxuICAgIG1vdmVCYWNrd2FyZDogXCJTXCIsXG4gICAgdHVybkxlZnQ6IFwiQVwiLFxuICAgIHR1cm5SaWdodDogXCJEXCIsXG4gICAgc3ByaW50OiBcIlNoaWZ0XCIsXG4gICAgY3JvdWNoOiBcIkN0cmxcIixcbiAgICBoYWlsOiBcIkhcIixcbiAgICBjb25zaWRlcjogXCJDXCIsXG4gICAganVtcDogXCJTcGFjZVwiLFxuICAgIHNpdFN0YW5kOiBcIkN0cmwrU1wiLFxuICAgIHRhcmdldE5lYXJlc3Q6IFwiVGFiXCIsXG4gICAgdGFyZ2V0UHJldmlvdXM6IFwiU2hpZnQrVGFiXCIsXG4gICAgaW52ZW50b3J5OiBcIklcIixcbiAgICBzcGVsbHM6IFwiUFwiLFxuICAgIGF1dG9BdHRhY2s6IFwiVFwiLFxuICAgIG9wdGlvbnM6IFwiRjEwXCIsXG5cbiAgICAvLyBDaGF0XG4gICAgcmVwbHk6IFwiUlwiLFxuICAgIC8vIE1pc2NcbiAgICBhdXRvUnVuOiBcIkNsZWFyXCIsXG5cbiAgICAvLyBIb3RrZXlzXG4gICAgaG90a2V5MTogXCIxXCIsXG4gICAgaG90a2V5MjogXCIyXCIsXG4gICAgaG90a2V5MzogXCIzXCIsXG4gICAgaG90a2V5NDogXCI0XCIsXG4gICAgaG90a2V5NTogXCI1XCIsXG4gICAgaG90a2V5NjogXCI2XCIsXG4gICAgaG90a2V5NzogXCI3XCIsXG4gICAgaG90a2V5ODogXCI4XCIsXG4gICAgaG90a2V5OTogXCI5XCIsXG4gICAgaG90a2V5MTA6IFwiMFwiLFxuICB9LFxuICBnYW1lcGFkQmluZGluZ3M6IHN0cnVjdHVyZWRDbG9uZShERUZBVUxUX0dBTUVQQURfQklORElOR1MpLFxuICBnYW1lcGFkOiB7IC4uLkRFRkFVTFRfR0FNRVBBRF9TRVRUSU5HUyB9LFxuICBzZXR0aW5nczoge1xuICAgIHBhcnRpY2xlczogdHJ1ZSxcbiAgICBzb3VuZDogdHJ1ZSxcbiAgICBtdXNpYzogdHJ1ZSxcbiAgICBtdXNpY1ZvbHVtZTogMC4yNSxcbiAgICByZW5kZXJTY2FsZTogMSxcbiAgfSxcbiAgdWk6IHtcbiAgICB0aGVtZTogXCJkZWZhdWx0XCIsXG4gICAgZm9udFNpemU6IDE0LFxuICAgIHNob3dUb29sdGlwczogdHJ1ZSxcbiAgICB1aVNjYWxlOiAxLFxuICAgIGh1ZExvY2tlZDogZmFsc2UsXG4gICAgaHVkV2luZG93czogc3RydWN0dXJlZENsb25lKERFRkFVTFRfSFVEX1dJTkRPV1MpLFxuICB9LFxuICBob3RCdXR0b25zOiB7XG4gICAgMDoge1xuICAgICAgdHlwZTogQWN0aW9uQnV0dG9uVHlwZS5NRUxFRV9BVFRBQ0ssXG4gICAgICBhY3Rpb246IEFjdGlvblR5cGUuTUVMRUVfQVRUQUNLLFxuICAgICAgbGFiZWw6IFwiTWVsZWUgQXR0YWNrXCIsXG4gICAgICBpbmRleDogMCxcbiAgICB9LFxuICAgIFwiMVwiOiB7XG4gICAgICB0eXBlOiBBY3Rpb25CdXR0b25UeXBlLlNPQ0lBTFMsXG4gICAgICBhY3Rpb246IEFjdGlvblR5cGUuU09DSUFMLFxuICAgICAgbGFiZWw6IFwiSGFpbFwiLFxuICAgICAgY29sb3I6IFwiIzAwRkYwMFwiLFxuICAgICAgZGF0YTogW1wiL2hhaWxcIl0sXG4gICAgICBpbmRleDogMCxcbiAgICB9LFxuICAgIFwiMlwiOiB7XG4gICAgICB0eXBlOiAxMixcbiAgICB9LFxuICAgIFwiM1wiOiB7XG4gICAgICB0eXBlOiBBY3Rpb25CdXR0b25UeXBlLlNPQ0lBTFMsXG4gICAgICBhY3Rpb246IEFjdGlvblR5cGUuU09DSUFMLFxuICAgICAgbGFiZWw6IFwiQ29uc2lkZXJcIixcbiAgICAgIGNvbG9yOiBcIiNGRkZGMDBcIixcbiAgICAgIGRhdGE6IFtcIi9jb25zaWRlclwiXSxcbiAgICAgIGluZGV4OiAxLFxuICAgIH0sXG4gICAgXCI0XCI6IHtcbiAgICAgIHR5cGU6IDgsXG4gICAgfSxcbiAgICBcIjVcIjoge1xuICAgICAgdHlwZTogMTMsXG4gICAgfSxcbiAgICBcIjlcIjoge1xuICAgICAgdHlwZTogMTEsXG4gICAgfSxcbiAgfSxcbiAgY29tYmF0QnV0dG9uczoge1xuICAgIDA6IHtcbiAgICAgIHR5cGU6IEFjdGlvbkJ1dHRvblR5cGUuTUVMRUVfQVRUQUNLLFxuICAgICAgYWN0aW9uOiBBY3Rpb25UeXBlLk1FTEVFX0FUVEFDSyxcbiAgICAgIGxhYmVsOiBcIk1lbGVlIEF0dGFja1wiLFxuICAgIH0sXG4gICAgMToge1xuICAgICAgdHlwZTogQWN0aW9uQnV0dG9uVHlwZS5SQU5HRURfQVRUQUNLLFxuICAgICAgYWN0aW9uOiBBY3Rpb25UeXBlLlJBTkdFRF9BVFRBQ0ssXG4gICAgICBsYWJlbDogXCJSYW5nZWQgQXR0YWNrXCIsXG4gICAgfSxcbiAgfSxcbiAgc29jaWFsQnV0dG9uczoge1xuICAgIDA6IHtcbiAgICAgIHR5cGU6IEFjdGlvbkJ1dHRvblR5cGUuU09DSUFMUyxcbiAgICAgIGFjdGlvbjogQWN0aW9uVHlwZS5TT0NJQUwsXG4gICAgICBsYWJlbDogXCJIYWlsXCIsXG4gICAgICBjb2xvcjogXCIjMDBGRjAwXCIsXG4gICAgICBkYXRhOiBbXCIvaGFpbFwiXSxcbiAgICB9LFxuICAgIDE6IHtcbiAgICAgIHR5cGU6IEFjdGlvbkJ1dHRvblR5cGUuU09DSUFMUyxcbiAgICAgIGFjdGlvbjogQWN0aW9uVHlwZS5TT0NJQUwsXG4gICAgICBsYWJlbDogXCJDb25zaWRlclwiLFxuICAgICAgY29sb3I6IFwiI0ZGRkYwMFwiLFxuICAgICAgZGF0YTogW1wiL2NvbnNpZGVyXCJdLFxuICAgIH0sXG4gICAgMjoge1xuICAgICAgdHlwZTogQWN0aW9uQnV0dG9uVHlwZS5TT0NJQUxTLFxuICAgICAgYWN0aW9uOiBBY3Rpb25UeXBlLlNPQ0lBTCxcbiAgICAgIGxhYmVsOiBcIkFma1wiLFxuICAgICAgY29sb3I6IFwiI0ZGMDBGRlwiLFxuICAgICAgZGF0YTogW1wiL2Fma1wiXSxcbiAgICB9LFxuICB9LFxuICBhYmlsaXR5QnV0dG9uczoge30sXG59O1xuXG5leHBvcnQgZnVuY3Rpb24gbWVyZ2VDb25maWcoY29uZmlnRGF0YTogUGFydGlhbDxDb25maWc+IHwgbnVsbCk6IENvbmZpZyB7XG4gIHJldHVybiB7XG4gICAga2V5QmluZGluZ3M6IHtcbiAgICAgIC4uLkRFRkFVTFRfQ09ORklHLmtleUJpbmRpbmdzLFxuICAgICAgLi4uY29uZmlnRGF0YT8ua2V5QmluZGluZ3MsXG4gICAgfSxcbiAgICBnYW1lcGFkQmluZGluZ3M6IHtcbiAgICAgIC4uLkRFRkFVTFRfQ09ORklHLmdhbWVwYWRCaW5kaW5ncyxcbiAgICAgIC4uLmNvbmZpZ0RhdGE/LmdhbWVwYWRCaW5kaW5ncyxcbiAgICB9LFxuICAgIGdhbWVwYWQ6IHtcbiAgICAgIC4uLkRFRkFVTFRfQ09ORklHLmdhbWVwYWQsXG4gICAgICAuLi5jb25maWdEYXRhPy5nYW1lcGFkLFxuICAgIH0sXG4gICAgc2V0dGluZ3M6IHtcbiAgICAgIC4uLkRFRkFVTFRfQ09ORklHLnNldHRpbmdzLFxuICAgICAgLi4uY29uZmlnRGF0YT8uc2V0dGluZ3MsXG4gICAgfSxcbiAgICB1aToge1xuICAgICAgLi4uREVGQVVMVF9DT05GSUcudWksXG4gICAgICAuLi5jb25maWdEYXRhPy51aSxcbiAgICAgIGh1ZFdpbmRvd3M6IHtcbiAgICAgICAgLi4uREVGQVVMVF9DT05GSUcudWkuaHVkV2luZG93cyxcbiAgICAgICAgLi4uY29uZmlnRGF0YT8udWk/Lmh1ZFdpbmRvd3MsXG4gICAgICB9LFxuICAgIH0sXG4gICAgaG90QnV0dG9uczoge1xuICAgICAgLi4uREVGQVVMVF9DT05GSUcuaG90QnV0dG9ucyxcbiAgICAgIC4uLmNvbmZpZ0RhdGE/LmhvdEJ1dHRvbnMsXG4gICAgfSxcbiAgICBjb21iYXRCdXR0b25zOiB7XG4gICAgICAuLi5ERUZBVUxUX0NPTkZJRy5jb21iYXRCdXR0b25zLFxuICAgICAgLi4uY29uZmlnRGF0YT8uY29tYmF0QnV0dG9ucyxcbiAgICB9LFxuICAgIHNvY2lhbEJ1dHRvbnM6IHtcbiAgICAgIC4uLkRFRkFVTFRfQ09ORklHLnNvY2lhbEJ1dHRvbnMsXG4gICAgICAuLi5jb25maWdEYXRhPy5zb2NpYWxCdXR0b25zLFxuICAgIH0sXG4gICAgYWJpbGl0eUJ1dHRvbnM6IHtcbiAgICAgIC4uLkRFRkFVTFRfQ09ORklHLmFiaWxpdHlCdXR0b25zLFxuICAgICAgLi4uY29uZmlnRGF0YT8uYWJpbGl0eUJ1dHRvbnMsXG4gICAgfSxcbiAgfTtcbn1cblxuZXhwb3J0IGNsYXNzIFVzZXJDb25maWcge1xuICBwcml2YXRlIHN0YXRpYyBpbnN0YW5jZV86IFVzZXJDb25maWc7XG4gIHByaXZhdGUgY29uZmlnOiBDb25maWc7XG4gIHByaXZhdGUgY29uZmlnRmlsZVBhdGggPSBcIlwiO1xuXG4gIHByaXZhdGUgYXN5bmMgZ2V0T3Bmc0NvbmZpZ0hhbmRsZShcbiAgICBjcmVhdGU6IGJvb2xlYW4sXG4gICAgZGlyZWN0b3J5UGF0aCA9IG9wZnNDb25maWdEaXJlY3RvcnksXG4gICk6IFByb21pc2U8RmlsZVN5c3RlbUZpbGVIYW5kbGUgfCBudWxsPiB7XG4gICAgaWYgKCFuYXZpZ2F0b3Iuc3RvcmFnZT8uZ2V0RGlyZWN0b3J5IHx8ICF0aGlzLmNvbmZpZ0ZpbGVQYXRoKSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCByb290ID0gYXdhaXQgbmF2aWdhdG9yLnN0b3JhZ2UuZ2V0RGlyZWN0b3J5KCk7XG4gICAgbGV0IGRpcmVjdG9yeTogRmlsZVN5c3RlbURpcmVjdG9yeUhhbmRsZSA9IHJvb3Q7XG4gICAgZm9yIChjb25zdCBzZWdtZW50IG9mIGRpcmVjdG9yeVBhdGguc3BsaXQoXCIvXCIpKSB7XG4gICAgICBkaXJlY3RvcnkgPSBhd2FpdCBkaXJlY3RvcnkuZ2V0RGlyZWN0b3J5SGFuZGxlKHNlZ21lbnQsIHsgY3JlYXRlIH0pO1xuICAgIH1cbiAgICByZXR1cm4gZGlyZWN0b3J5LmdldEZpbGVIYW5kbGUodGhpcy5jb25maWdGaWxlUGF0aCwgeyBjcmVhdGUgfSk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlYWRPcGZzQ29uZmlnKFxuICAgIGRpcmVjdG9yeVBhdGggPSBvcGZzQ29uZmlnRGlyZWN0b3J5LFxuICApOiBQcm9taXNlPFBhcnRpYWw8Q29uZmlnPiB8IG51bGw+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgaGFuZGxlID0gYXdhaXQgdGhpcy5nZXRPcGZzQ29uZmlnSGFuZGxlKGZhbHNlLCBkaXJlY3RvcnlQYXRoKTtcbiAgICAgIGlmICghaGFuZGxlKSByZXR1cm4gbnVsbDtcbiAgICAgIGNvbnN0IGZpbGUgPSBhd2FpdCBoYW5kbGUuZ2V0RmlsZSgpO1xuICAgICAgY29uc3QgdGV4dCA9IGF3YWl0IGZpbGUudGV4dCgpO1xuICAgICAgcmV0dXJuIHRleHQgPyAoSlNPTi5wYXJzZSh0ZXh0KSBhcyBQYXJ0aWFsPENvbmZpZz4pIDogbnVsbDtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgaWYgKGVycm9yIGluc3RhbmNlb2YgRE9NRXhjZXB0aW9uICYmIGVycm9yLm5hbWUgPT09IFwiTm90Rm91bmRFcnJvclwiKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICBgRmFpbGVkIHRvIHJlYWQgT1BGUyBjb25maWcgJHtkaXJlY3RvcnlQYXRofS8ke3RoaXMuY29uZmlnRmlsZVBhdGh9OmAsXG4gICAgICAgIGVycm9yLFxuICAgICAgKTtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgd3JpdGVPcGZzQ29uZmlnKHNlcmlhbGl6ZWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IGhhbmRsZSA9IGF3YWl0IHRoaXMuZ2V0T3Bmc0NvbmZpZ0hhbmRsZSh0cnVlKTtcbiAgICBpZiAoIWhhbmRsZSkgcmV0dXJuO1xuICAgIGNvbnN0IHdyaXRhYmxlID0gYXdhaXQgaGFuZGxlLmNyZWF0ZVdyaXRhYmxlKCk7XG4gICAgYXdhaXQgd3JpdGFibGUud3JpdGUoc2VyaWFsaXplZCk7XG4gICAgYXdhaXQgd3JpdGFibGUuY2xvc2UoKTtcbiAgfVxuXG4gIHByaXZhdGUgY29uc3RydWN0b3IoKSB7XG4gICAgdGhpcy5jb25maWcgPSBERUZBVUxUX0NPTkZJRztcbiAgICBlbWl0dGVyLm9uKFwidXBkYXRlQ29uZmlnXCIsIHRoaXMudXBkYXRlQ29uZmlnRXZlbnQuYmluZCh0aGlzKSk7XG4gIH1cblxuICBwcml2YXRlIHVwZGF0ZUNvbmZpZ0V2ZW50KGtleT86IGtleW9mIENvbmZpZyk6IHZvaWQge1xuICAgIHN3aXRjaCAoa2V5KSB7XG4gICAgICBjYXNlIFwia2V5QmluZGluZ3NcIjpcbiAgICAgICAgZW1pdHRlci5lbWl0KFwidXBkYXRlS2V5YmluZHNcIik7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcImdhbWVwYWRCaW5kaW5nc1wiOlxuICAgICAgY2FzZSBcImdhbWVwYWRcIjpcbiAgICAgICAgZW1pdHRlci5lbWl0KFwidXBkYXRlR2FtZXBhZFwiKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwic2V0dGluZ3NcIjpcbiAgICAgICAgZW1pdHRlci5lbWl0KFwidXBkYXRlU2V0dGluZ3NcIik7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcInVpXCI6XG4gICAgICAgIGVtaXR0ZXIuZW1pdChcInVwZGF0ZVVJXCIpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJob3RCdXR0b25zXCI6XG4gICAgICAgIGVtaXR0ZXIuZW1pdChcInVwZGF0ZUhvdEJ1dHRvbnNcIik7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcImNvbWJhdEJ1dHRvbnNcIjpcbiAgICAgICAgZW1pdHRlci5lbWl0KFwidXBkYXRlQ29tYmF0QnV0dG9uc1wiKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwic29jaWFsQnV0dG9uc1wiOlxuICAgICAgICBlbWl0dGVyLmVtaXQoXCJ1cGRhdGVTb2NpYWxCdXR0b25zXCIpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJhYmlsaXR5QnV0dG9uc1wiOlxuICAgICAgICBlbWl0dGVyLmVtaXQoXCJ1cGRhdGVBYmlsaXR5QnV0dG9uc1wiKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICBlbWl0dGVyLmVtaXQoXCJ1cGRhdGVTZXR0aW5nc1wiKTtcbiAgICAgICAgZW1pdHRlci5lbWl0KFwidXBkYXRlVUlcIik7XG4gICAgICAgIGVtaXR0ZXIuZW1pdChcInVwZGF0ZUtleWJpbmRzXCIpO1xuICAgICAgICBlbWl0dGVyLmVtaXQoXCJ1cGRhdGVHYW1lcGFkXCIpO1xuICAgICAgICBlbWl0dGVyLmVtaXQoXCJ1cGRhdGVIb3RCdXR0b25zXCIpO1xuICAgICAgICBlbWl0dGVyLmVtaXQoXCJ1cGRhdGVDb21iYXRCdXR0b25zXCIpO1xuICAgICAgICBlbWl0dGVyLmVtaXQoXCJ1cGRhdGVTb2NpYWxCdXR0b25zXCIpO1xuICAgICAgICBlbWl0dGVyLmVtaXQoXCJ1cGRhdGVBYmlsaXR5QnV0dG9uc1wiKTtcbiAgICB9XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgaW5pdGlhbGl6ZShzZXJ2ZXI6IHN0cmluZywgcGxheWVyOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0aGlzLmNvbmZpZ0ZpbGVQYXRoID0gYCR7c2VydmVyfV8ke3BsYXllcn1fJHtjb25maWdWZXJzaW9ufS5qc29uYDtcbiAgICBsZXQgY29uZmlnRGF0YSA9IGF3YWl0IHRoaXMucmVhZE9wZnNDb25maWcoKTtcbiAgICBpZiAoIWNvbmZpZ0RhdGEpIHtcbiAgICAgIGNvbmZpZ0RhdGEgPSBhd2FpdCB0aGlzLnJlYWRPcGZzQ29uZmlnKGxlZ2FjeU9wZnNDb25maWdEaXJlY3RvcnkpO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgaWYgKCFjb25maWdEYXRhKSB7XG4gICAgICAgIGNvbnN0IHN0b3JlZCA9IGxvY2FsU3RvcmFnZS5nZXRJdGVtKFxuICAgICAgICAgIGAke2NvbmZpZ1N0b3JhZ2VQcmVmaXh9JHt0aGlzLmNvbmZpZ0ZpbGVQYXRofWAsXG4gICAgICAgICk7XG4gICAgICAgIGNvbmZpZ0RhdGEgPSBzdG9yZWQgPyAoSlNPTi5wYXJzZShzdG9yZWQpIGFzIFBhcnRpYWw8Q29uZmlnPikgOiBudWxsO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBjb25maWcgJHt0aGlzLmNvbmZpZ0ZpbGVQYXRofTpgLCBlcnJvcik7XG4gICAgfVxuICAgIGNvbnNvbGUubG9nKFwiQ29uZmlnIGRhdGFcIiwgY29uZmlnRGF0YSk7XG4gICAgdGhpcy5jb25maWcgPSBtZXJnZUNvbmZpZyhjb25maWdEYXRhKTtcbiAgICBlbWl0dGVyLmVtaXQoXCJ1cGRhdGVDb25maWdcIik7XG4gICAgdGhpcy5zYXZlKCk7XG4gIH1cblxuICBwdWJsaWMgc3dhcEhvdEJ1dHRvbnMoaW5kZXgxOiBudW1iZXIsIGluZGV4MjogbnVtYmVyID0gaW5kZXgxICsgMSk6IHZvaWQge1xuICAgIGNvbnN0IHRlbXAgPSB0aGlzLmNvbmZpZy5ob3RCdXR0b25zW2luZGV4MV07XG4gICAgdGhpcy5jb25maWcuaG90QnV0dG9uc1tpbmRleDFdID0gdGhpcy5jb25maWcuaG90QnV0dG9uc1tpbmRleDJdO1xuICAgIGlmICh0ZW1wICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIHRoaXMuY29uZmlnLmhvdEJ1dHRvbnNbaW5kZXgyXSA9IHRlbXA7XG4gICAgfSBlbHNlIHtcbiAgICAgIGRlbGV0ZSB0aGlzLmNvbmZpZy5ob3RCdXR0b25zW2luZGV4Ml07XG4gICAgfVxuICAgIGVtaXR0ZXIuZW1pdChcInVwZGF0ZUNvbmZpZ1wiLCBcImhvdEJ1dHRvbnNcIik7XG4gICAgdGhpcy5zYXZlKCk7XG4gIH1cblxuICBwdWJsaWMgdXBkYXRlSG90QnV0dG9uKGluZGV4OiBudW1iZXIsIGFjdGlvbkJ1dHRvbjogQWN0aW9uQnV0dG9uRGF0YSB8IG51bGwpIHtcbiAgICBpZiAoYWN0aW9uQnV0dG9uKSB7XG4gICAgICB0aGlzLmNvbmZpZy5ob3RCdXR0b25zW2luZGV4XSA9IGFjdGlvbkJ1dHRvbjtcbiAgICB9IGVsc2Uge1xuICAgICAgZGVsZXRlIHRoaXMuY29uZmlnLmhvdEJ1dHRvbnNbaW5kZXhdO1xuICAgIH1cbiAgICBlbWl0dGVyLmVtaXQoXCJ1cGRhdGVDb25maWdcIiwgXCJob3RCdXR0b25zXCIpO1xuICAgIHRoaXMuc2F2ZSgpO1xuICB9XG5cbiAgcHVibGljIHVwZGF0ZUNvbWJhdEJ1dHRvbihcbiAgICBpbmRleDogbnVtYmVyLFxuICAgIGFjdGlvbkJ1dHRvbjogQWN0aW9uQnV0dG9uRGF0YSB8IG51bGwsXG4gICkge1xuICAgIGlmIChhY3Rpb25CdXR0b24pIHtcbiAgICAgIHRoaXMuY29uZmlnLmNvbWJhdEJ1dHRvbnNbaW5kZXhdID0gYWN0aW9uQnV0dG9uO1xuICAgIH0gZWxzZSB7XG4gICAgICBkZWxldGUgdGhpcy5jb25maWcuY29tYmF0QnV0dG9uc1tpbmRleF07XG4gICAgfVxuICAgIGVtaXR0ZXIuZW1pdChcInVwZGF0ZUNvbmZpZ1wiLCBcImNvbWJhdEJ1dHRvbnNcIik7XG4gICAgdGhpcy5zYXZlKCk7XG4gIH1cblxuICBwdWJsaWMgdXBkYXRlU29jaWFsQnV0dG9uKFxuICAgIGluZGV4OiBudW1iZXIsXG4gICAgYWN0aW9uQnV0dG9uOiBBY3Rpb25CdXR0b25EYXRhIHwgbnVsbCxcbiAgKSB7XG4gICAgaWYgKGFjdGlvbkJ1dHRvbikge1xuICAgICAgdGhpcy5jb25maWcuc29jaWFsQnV0dG9uc1tpbmRleF0gPSBhY3Rpb25CdXR0b247XG4gICAgfSBlbHNlIHtcbiAgICAgIGRlbGV0ZSB0aGlzLmNvbmZpZy5zb2NpYWxCdXR0b25zW2luZGV4XTtcbiAgICB9XG4gICAgZW1pdHRlci5lbWl0KFwidXBkYXRlQ29uZmlnXCIsIFwic29jaWFsQnV0dG9uc1wiKTtcbiAgICB0aGlzLnNhdmUoKTtcbiAgfVxuXG4gIHB1YmxpYyB1cGRhdGVBYmlsaXR5QnV0dG9uKFxuICAgIGluZGV4OiBudW1iZXIsXG4gICAgYWN0aW9uQnV0dG9uOiBBY3Rpb25CdXR0b25EYXRhIHwgbnVsbCxcbiAgKSB7XG4gICAgaWYgKGFjdGlvbkJ1dHRvbikge1xuICAgICAgdGhpcy5jb25maWcuYWJpbGl0eUJ1dHRvbnNbaW5kZXhdID0gYWN0aW9uQnV0dG9uO1xuICAgIH0gZWxzZSB7XG4gICAgICBkZWxldGUgdGhpcy5jb25maWcuYWJpbGl0eUJ1dHRvbnNbaW5kZXhdO1xuICAgIH1cbiAgICBlbWl0dGVyLmVtaXQoXCJ1cGRhdGVDb25maWdcIiwgXCJhYmlsaXR5QnV0dG9uc1wiKTtcbiAgICB0aGlzLnNhdmUoKTtcbiAgfVxuXG4gIHB1YmxpYyB1cGRhdGVLZXliaW5kKGtleToga2V5b2YgS2V5QmluZGluZ3MsIHZhbHVlOiBzdHJpbmcpOiB2b2lkIHtcbiAgICB0aGlzLmNvbmZpZy5rZXlCaW5kaW5nc1trZXldID0gdmFsdWU7XG4gICAgZW1pdHRlci5lbWl0KFwidXBkYXRlQ29uZmlnXCIsIFwia2V5QmluZGluZ3NcIik7XG4gICAgdGhpcy5zYXZlKCk7XG4gIH1cblxuICBwdWJsaWMgcmVzZXRLZXliaW5kcygpOiB2b2lkIHtcbiAgICB0aGlzLmNvbmZpZy5rZXlCaW5kaW5ncyA9IHsgLi4uREVGQVVMVF9DT05GSUcua2V5QmluZGluZ3MgfTtcbiAgICBlbWl0dGVyLmVtaXQoXCJ1cGRhdGVDb25maWdcIiwgXCJrZXlCaW5kaW5nc1wiKTtcbiAgICB0aGlzLnNhdmUoKTtcbiAgfVxuXG4gIHB1YmxpYyB1cGRhdGVHYW1lcGFkQmluZGluZyhcbiAgICBrZXk6IGtleW9mIEdhbWVwYWRCaW5kaW5ncyxcbiAgICB2YWx1ZTogc3RyaW5nLFxuICApOiB2b2lkIHtcbiAgICB0aGlzLmNvbmZpZy5nYW1lcGFkQmluZGluZ3Nba2V5XSA9IHZhbHVlO1xuICAgIGVtaXR0ZXIuZW1pdChcInVwZGF0ZUNvbmZpZ1wiLCBcImdhbWVwYWRCaW5kaW5nc1wiKTtcbiAgICB0aGlzLnNhdmUoKTtcbiAgfVxuXG4gIHB1YmxpYyByZXNldEdhbWVwYWRCaW5kaW5ncygpOiB2b2lkIHtcbiAgICB0aGlzLmNvbmZpZy5nYW1lcGFkQmluZGluZ3MgPSBzdHJ1Y3R1cmVkQ2xvbmUoREVGQVVMVF9HQU1FUEFEX0JJTkRJTkdTKTtcbiAgICBlbWl0dGVyLmVtaXQoXCJ1cGRhdGVDb25maWdcIiwgXCJnYW1lcGFkQmluZGluZ3NcIik7XG4gICAgdGhpcy5zYXZlKCk7XG4gIH1cblxuICBwdWJsaWMgdXBkYXRlR2FtZXBhZFNldHRpbmc8SyBleHRlbmRzIGtleW9mIEdhbWVwYWRTZXR0aW5ncz4oXG4gICAga2V5OiBLLFxuICAgIHZhbHVlOiBHYW1lcGFkU2V0dGluZ3NbS10sXG4gICk6IHZvaWQge1xuICAgIHRoaXMuY29uZmlnLmdhbWVwYWRba2V5XSA9IHZhbHVlO1xuICAgIGVtaXR0ZXIuZW1pdChcInVwZGF0ZUNvbmZpZ1wiLCBcImdhbWVwYWRcIik7XG4gICAgdGhpcy5zYXZlKCk7XG4gIH1cblxuICBwdWJsaWMgdXBkYXRlU2V0dGluZzxLIGV4dGVuZHMga2V5b2YgU2V0dGluZ3M+KFxuICAgIGtleTogSyxcbiAgICB2YWx1ZTogU2V0dGluZ3NbS10sXG4gICk6IHZvaWQge1xuICAgIHRoaXMuY29uZmlnLnNldHRpbmdzW2tleV0gPSB2YWx1ZTtcbiAgICBlbWl0dGVyLmVtaXQoXCJ1cGRhdGVDb25maWdcIiwgXCJzZXR0aW5nc1wiKTtcbiAgICB0aGlzLnNhdmUoKTtcbiAgfVxuXG4gIHB1YmxpYyB1cGRhdGVVSVNldHRpbmc8SyBleHRlbmRzIGtleW9mIFVJU2V0dGluZ3M+KFxuICAgIGtleTogSyxcbiAgICB2YWx1ZTogVUlTZXR0aW5nc1tLXSxcbiAgKTogdm9pZCB7XG4gICAgdGhpcy5jb25maWcudWlba2V5XSA9IHZhbHVlO1xuICAgIGVtaXR0ZXIuZW1pdChcInVwZGF0ZUNvbmZpZ1wiLCBcInVpXCIpO1xuICAgIHRoaXMuc2F2ZSgpO1xuICB9XG5cbiAgcHVibGljIHVwZGF0ZUh1ZFdpbmRvdyhcbiAgICBrZXk6IEh1ZFdpbmRvd0lkLFxuICAgIHBsYWNlbWVudDogSHVkV2luZG93UGxhY2VtZW50LFxuICApOiB2b2lkIHtcbiAgICB0aGlzLmNvbmZpZy51aS5odWRXaW5kb3dzW2tleV0gPSBwbGFjZW1lbnQ7XG4gICAgZW1pdHRlci5lbWl0KFwidXBkYXRlQ29uZmlnXCIsIFwidWlcIik7XG4gICAgdGhpcy5zYXZlKCk7XG4gIH1cblxuICBwdWJsaWMgcmVzZXRIdWRXaW5kb3dzKCk6IHZvaWQge1xuICAgIHRoaXMuY29uZmlnLnVpLmh1ZFdpbmRvd3MgPSBzdHJ1Y3R1cmVkQ2xvbmUoREVGQVVMVF9IVURfV0lORE9XUyk7XG4gICAgZW1pdHRlci5lbWl0KFwidXBkYXRlQ29uZmlnXCIsIFwidWlcIik7XG4gICAgdGhpcy5zYXZlKCk7XG4gIH1cbiAgcHJpdmF0ZSBzYXZlVGltZW91dDogTm9kZUpTLlRpbWVvdXQgfCBudWxsID0gbnVsbDtcblxuICBwcml2YXRlIHNhdmUoKTogdm9pZCB7XG4gICAgaWYgKHRoaXMuc2F2ZVRpbWVvdXQpIHtcbiAgICAgIGNsZWFyVGltZW91dCh0aGlzLnNhdmVUaW1lb3V0KTtcbiAgICB9XG4gICAgdGhpcy5zYXZlVGltZW91dCA9IHNldFRpbWVvdXQoYXN5bmMgKCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3Qgc2VyaWFsaXplZCA9IEpTT04uc3RyaW5naWZ5KHRoaXMuY29uZmlnKTtcbiAgICAgICAgYXdhaXQgdGhpcy53cml0ZU9wZnNDb25maWcoc2VyaWFsaXplZCk7XG4gICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKFxuICAgICAgICAgIGAke2NvbmZpZ1N0b3JhZ2VQcmVmaXh9JHt0aGlzLmNvbmZpZ0ZpbGVQYXRofWAsXG4gICAgICAgICAgc2VyaWFsaXplZCxcbiAgICAgICAgKTtcbiAgICAgICAgY29uc29sZS5sb2coYENvbmZpZyBzYXZlZCB0byBPUEZTOiAke3RoaXMuY29uZmlnRmlsZVBhdGh9YCk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gc2F2ZSBjb25maWcgJHt0aGlzLmNvbmZpZ0ZpbGVQYXRofTpgLCBlcnJvcik7XG4gICAgICB9XG4gICAgICB0aGlzLnNhdmVUaW1lb3V0ID0gbnVsbDtcbiAgICB9LCAzMDApO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBnZXQgaW5zdGFuY2UoKTogVXNlckNvbmZpZyB7XG4gICAgaWYgKCFVc2VyQ29uZmlnLmluc3RhbmNlXykge1xuICAgICAgVXNlckNvbmZpZy5pbnN0YW5jZV8gPSBuZXcgVXNlckNvbmZpZygpO1xuICAgIH1cbiAgICByZXR1cm4gVXNlckNvbmZpZy5pbnN0YW5jZV87XG4gIH1cblxuICBwdWJsaWMgZ2V0Q29uZmlnKCk6IENvbmZpZyB7XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnO1xuICB9XG5cbiAgcHVibGljIGdldDxLIGV4dGVuZHMga2V5b2YgQ29uZmlnPihrZXk6IEspOiBDb25maWdbS10ge1xuICAgIHJldHVybiB0aGlzLmNvbmZpZ1trZXldO1xuICB9XG5cbiAgcHVibGljIHNldDxLIGV4dGVuZHMga2V5b2YgQ29uZmlnPihrZXk6IEssIHZhbHVlOiBDb25maWdbS10pOiB2b2lkIHtcbiAgICB0aGlzLmNvbmZpZ1trZXldID0gdmFsdWU7XG4gIH1cblxuICBwdWJsaWMgcmVzZXQoKTogdm9pZCB7XG4gICAgdGhpcy5jb25maWcgPSBtZXJnZUNvbmZpZyhudWxsKTtcbiAgICBlbWl0dGVyLmVtaXQoXCJ1cGRhdGVDb25maWdcIik7XG4gICAgdGhpcy5zYXZlKCk7XG4gIH1cbn1cblxuZ2xvYmFsVGhpcy5Vc2VyQ29uZmlnID0gVXNlckNvbmZpZy5pbnN0YW5jZTtcbiIsICIvLyBGaWxlOiBjbGllbnQvc3JjL0dhbWUvQ29uZmlnL2dhbWVwYWQtYmluZGluZ3MudHNcbi8vXG4vLyBQdXJlIGhlbHBlcnMgZm9yIHRoZSBXM0MgR2FtZXBhZCBBUEkgXCJzdGFuZGFyZFwiIG1hcHBpbmcuIFRoaXMgbW9kdWxlIGlzIGtlcHRcbi8vIGZyZWUgb2YgQmFieWxvbi9SZWFjdC9jb25maWcgaW1wb3J0cyBzbyB0aGUgbWFwcGluZyBjYW4gYmUgZXhlcmNpc2VkIG9uIGl0c1xuLy8gb3duIGluIHRlc3RzLlxuXG4vKiogRGlnaXRhbCBjb250cm9sbGVyIGFjdGlvbnMuIEFuYWxvZyBzdGlja3MgYXJlIGJvdW5kIHNlcGFyYXRlbHkuICovXG5leHBvcnQgdHlwZSBHYW1lcGFkRGlnaXRhbEFjdGlvbiA9XG4gIHwgJ2p1bXAnXG4gIHwgJ3NwcmludCdcbiAgfCAnY3JvdWNoJ1xuICB8ICdhdXRvUnVuJ1xuICB8ICdzaXRTdGFuZCdcbiAgfCAnYXV0b0F0dGFjaydcbiAgfCAnaGFpbCdcbiAgfCAnY29uc2lkZXInXG4gIHwgJ3RhcmdldE5lYXJlc3QnXG4gIHwgJ2NsZWFyVGFyZ2V0J1xuICB8ICdpbnZlbnRvcnknXG4gIHwgJ29wdGlvbnMnXG4gIHwgJ2NhbWVyYVRvZ2dsZSdcbiAgfCAnaG90a2V5TW9kaWZpZXInXG4gIHwgJ2hvdGtleTEnXG4gIHwgJ2hvdGtleTInXG4gIHwgJ2hvdGtleTMnXG4gIHwgJ2hvdGtleTQnO1xuXG5leHBvcnQgdHlwZSBHYW1lcGFkQXhpc0FjdGlvbiA9ICdtb3ZlQXhpc1gnIHwgJ21vdmVBeGlzWScgfCAnbG9va0F4aXNYJyB8ICdsb29rQXhpc1knO1xuXG4vKiogSHVtYW4gcmVhZGFibGUgbmFtZXMgZm9yIHRoZSBzdGFuZGFyZC1tYXBwaW5nIGJ1dHRvbnMsIGluZGV4ZWQgYnkgYnV0dG9uIGlkLiAqL1xuZXhwb3J0IGNvbnN0IEdBTUVQQURfQlVUVE9OX0xBQkVMUzogcmVhZG9ubHkgc3RyaW5nW10gPSBbXG4gICdBIC8gQ3Jvc3MnLFxuICAnQiAvIENpcmNsZScsXG4gICdYIC8gU3F1YXJlJyxcbiAgJ1kgLyBUcmlhbmdsZScsXG4gICdMZWZ0IEJ1bXBlcicsXG4gICdSaWdodCBCdW1wZXInLFxuICAnTGVmdCBUcmlnZ2VyJyxcbiAgJ1JpZ2h0IFRyaWdnZXInLFxuICAnQmFjayAvIFNoYXJlJyxcbiAgJ1N0YXJ0IC8gT3B0aW9ucycsXG4gICdMZWZ0IFN0aWNrIENsaWNrJyxcbiAgJ1JpZ2h0IFN0aWNrIENsaWNrJyxcbiAgJ0QtUGFkIFVwJyxcbiAgJ0QtUGFkIERvd24nLFxuICAnRC1QYWQgTGVmdCcsXG4gICdELVBhZCBSaWdodCcsXG4gICdHdWlkZScsXG5dO1xuXG4vKiogSHVtYW4gcmVhZGFibGUgbmFtZXMgZm9yIHRoZSBzdGFuZGFyZC1tYXBwaW5nIGF4ZXMsIGluZGV4ZWQgYnkgYXhpcyBpZC4gKi9cbmV4cG9ydCBjb25zdCBHQU1FUEFEX0FYSVNfTEFCRUxTOiByZWFkb25seSBzdHJpbmdbXSA9IFtcbiAgJ0xlZnQgU3RpY2sgWCcsXG4gICdMZWZ0IFN0aWNrIFknLFxuICAnUmlnaHQgU3RpY2sgWCcsXG4gICdSaWdodCBTdGljayBZJyxcbl07XG5cbi8qKiBBIHRyaWdnZXIvYnV0dG9uIGlzIGNvbnNpZGVyZWQgcHJlc3NlZCBwYXN0IHRoaXMgYW5hbG9nIHZhbHVlLiAqL1xuZXhwb3J0IGNvbnN0IEJVVFRPTl9QUkVTU19USFJFU0hPTEQgPSAwLjU7XG5cbi8qKiBNaW5pbXVtIGF4aXMgdHJhdmVsIHJlcXVpcmVkIGJlZm9yZSB0aGUgYmluZGluZyBjYXB0dXJlIFVJIGFjY2VwdHMgYW4gYXhpcy4gKi9cbmV4cG9ydCBjb25zdCBBWElTX0NBUFRVUkVfVEhSRVNIT0xEID0gMC42O1xuXG5leHBvcnQgY29uc3QgZ2FtZXBhZEJ1dHRvbkJpbmRpbmcgPSAoaW5kZXg6IG51bWJlcik6IHN0cmluZyA9PiBgQnV0dG9uJHtpbmRleH1gO1xuZXhwb3J0IGNvbnN0IGdhbWVwYWRBeGlzQmluZGluZyA9IChpbmRleDogbnVtYmVyKTogc3RyaW5nID0+IGBBeGlzJHtpbmRleH1gO1xuXG4vKiogVHVybnMgYEJ1dHRvbjNgIC8gYEF4aXMyYCBpbnRvIHNvbWV0aGluZyBhIHBsYXllciBjYW4gcmVhZC4gKi9cbmV4cG9ydCBjb25zdCBwcmVzZW50R2FtZXBhZEJpbmRpbmcgPSAoYmluZGluZzogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgaWYgKCFiaW5kaW5nKSByZXR1cm4gJ1VuYm91bmQnO1xuICBjb25zdCBidXR0b24gPSAvXkJ1dHRvbihcXGQrKSQvLmV4ZWMoYmluZGluZyk7XG4gIGlmIChidXR0b24pIHtcbiAgICBjb25zdCBpbmRleCA9IE51bWJlcihidXR0b25bMV0pO1xuICAgIHJldHVybiBHQU1FUEFEX0JVVFRPTl9MQUJFTFNbaW5kZXhdID8/IGBCdXR0b24gJHtpbmRleH1gO1xuICB9XG4gIGNvbnN0IGF4aXMgPSAvXkF4aXMoXFxkKykkLy5leGVjKGJpbmRpbmcpO1xuICBpZiAoYXhpcykge1xuICAgIGNvbnN0IGluZGV4ID0gTnVtYmVyKGF4aXNbMV0pO1xuICAgIHJldHVybiBHQU1FUEFEX0FYSVNfTEFCRUxTW2luZGV4XSA/PyBgQXhpcyAke2luZGV4fWA7XG4gIH1cbiAgcmV0dXJuIGJpbmRpbmc7XG59O1xuXG5leHBvcnQgY29uc3QgcGFyc2VCdXR0b25CaW5kaW5nID0gKGJpbmRpbmc6IHN0cmluZyk6IG51bWJlciB8IG51bGwgPT4ge1xuICBjb25zdCBtYXRjaCA9IC9eQnV0dG9uKFxcZCspJC8uZXhlYyhiaW5kaW5nID8/ICcnKTtcbiAgcmV0dXJuIG1hdGNoID8gTnVtYmVyKG1hdGNoWzFdKSA6IG51bGw7XG59O1xuXG5leHBvcnQgY29uc3QgcGFyc2VBeGlzQmluZGluZyA9IChiaW5kaW5nOiBzdHJpbmcpOiBudW1iZXIgfCBudWxsID0+IHtcbiAgY29uc3QgbWF0Y2ggPSAvXkF4aXMoXFxkKykkLy5leGVjKGJpbmRpbmcgPz8gJycpO1xuICByZXR1cm4gbWF0Y2ggPyBOdW1iZXIobWF0Y2hbMV0pIDogbnVsbDtcbn07XG5cbi8qKlxuICogUmFkaWFsLXN0eWxlIGRlYWR6b25lIG9uIGEgc2luZ2xlIGF4aXM6IGV2ZXJ5dGhpbmcgaW5zaWRlIGBkZWFkem9uZWAgcmVhZHMgYXNcbiAqIHplcm8sIGFuZCB0aGUgcmVtYWluaW5nIHRyYXZlbCBpcyByZXNjYWxlZCBzbyB0aGUgc3RpY2sgc3RpbGwgcmVhY2hlcyAxLjAuXG4gKi9cbmV4cG9ydCBjb25zdCBhcHBseURlYWR6b25lID0gKHZhbHVlOiBudW1iZXIsIGRlYWR6b25lOiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICBpZiAoIU51bWJlci5pc0Zpbml0ZSh2YWx1ZSkpIHJldHVybiAwO1xuICBjb25zdCBsaW1pdCA9IE1hdGgubWluKE1hdGgubWF4KGRlYWR6b25lLCAwKSwgMC45NSk7XG4gIGNvbnN0IG1hZ25pdHVkZSA9IE1hdGguYWJzKHZhbHVlKTtcbiAgaWYgKG1hZ25pdHVkZSA8PSBsaW1pdCkgcmV0dXJuIDA7XG4gIGNvbnN0IHNjYWxlZCA9IChtYWduaXR1ZGUgLSBsaW1pdCkgLyAoMSAtIGxpbWl0KTtcbiAgcmV0dXJuIE1hdGguc2lnbih2YWx1ZSkgKiBNYXRoLm1pbigxLCBzY2FsZWQpO1xufTtcblxuLyoqIFNjYWxlcyBhIHN0aWNrIGFzIGEgdW5pdCBzbyBkaWFnb25hbHMgYXJlbid0IGZhc3RlciB0aGFuIGNhcmRpbmFscy4gKi9cbmV4cG9ydCBjb25zdCBhcHBseVN0aWNrRGVhZHpvbmUgPSAoXG4gIHg6IG51bWJlcixcbiAgeTogbnVtYmVyLFxuICBkZWFkem9uZTogbnVtYmVyLFxuKTogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9ID0+IHtcbiAgY29uc3Qgc2FmZVggPSBOdW1iZXIuaXNGaW5pdGUoeCkgPyB4IDogMDtcbiAgY29uc3Qgc2FmZVkgPSBOdW1iZXIuaXNGaW5pdGUoeSkgPyB5IDogMDtcbiAgY29uc3QgbWFnbml0dWRlID0gTWF0aC5oeXBvdChzYWZlWCwgc2FmZVkpO1xuICBpZiAobWFnbml0dWRlID09PSAwKSByZXR1cm4geyB4OiAwLCB5OiAwIH07XG4gIGNvbnN0IHNjYWxlZCA9IGFwcGx5RGVhZHpvbmUobWFnbml0dWRlLCBkZWFkem9uZSk7XG4gIGlmIChzY2FsZWQgPT09IDApIHJldHVybiB7IHg6IDAsIHk6IDAgfTtcbiAgcmV0dXJuIHsgeDogKHNhZmVYIC8gbWFnbml0dWRlKSAqIHNjYWxlZCwgeTogKHNhZmVZIC8gbWFnbml0dWRlKSAqIHNjYWxlZCB9O1xufTtcblxuLyoqIE1pbmltYWwgc3RydWN0dXJhbCB2aWV3IG9mIGEgYEdhbWVwYWRgLCBzbyB0ZXN0cyBjYW4gc3VwcGx5IHBsYWluIG9iamVjdHMuICovXG5leHBvcnQgaW50ZXJmYWNlIEdhbWVwYWRMaWtlIHtcbiAgaW5kZXg/OiBudW1iZXI7XG4gIGlkPzogc3RyaW5nO1xuICBjb25uZWN0ZWQ/OiBib29sZWFuO1xuICBtYXBwaW5nPzogc3RyaW5nO1xuICBheGVzOiByZWFkb25seSBudW1iZXJbXTtcbiAgYnV0dG9uczogcmVhZG9ubHkgeyBwcmVzc2VkPzogYm9vbGVhbjsgdmFsdWU/OiBudW1iZXIgfVtdO1xufVxuXG5leHBvcnQgY29uc3QgaXNCdXR0b25QcmVzc2VkID0gKFxuICBnYW1lcGFkOiBHYW1lcGFkTGlrZSB8IG51bGwgfCB1bmRlZmluZWQsXG4gIGluZGV4OiBudW1iZXIgfCBudWxsLFxuKTogYm9vbGVhbiA9PiB7XG4gIGlmICghZ2FtZXBhZCB8fCBpbmRleCA9PT0gbnVsbCB8fCBpbmRleCA8IDApIHJldHVybiBmYWxzZTtcbiAgY29uc3QgYnV0dG9uID0gZ2FtZXBhZC5idXR0b25zPy5baW5kZXhdO1xuICBpZiAoIWJ1dHRvbikgcmV0dXJuIGZhbHNlO1xuICBpZiAoYnV0dG9uLnByZXNzZWQpIHJldHVybiB0cnVlO1xuICByZXR1cm4gKGJ1dHRvbi52YWx1ZSA/PyAwKSA+PSBCVVRUT05fUFJFU1NfVEhSRVNIT0xEO1xufTtcblxuZXhwb3J0IGNvbnN0IHJlYWRBeGlzID0gKFxuICBnYW1lcGFkOiBHYW1lcGFkTGlrZSB8IG51bGwgfCB1bmRlZmluZWQsXG4gIGluZGV4OiBudW1iZXIgfCBudWxsLFxuKTogbnVtYmVyID0+IHtcbiAgaWYgKCFnYW1lcGFkIHx8IGluZGV4ID09PSBudWxsIHx8IGluZGV4IDwgMCkgcmV0dXJuIDA7XG4gIGNvbnN0IHZhbHVlID0gZ2FtZXBhZC5heGVzPy5baW5kZXhdO1xuICByZXR1cm4gTnVtYmVyLmlzRmluaXRlKHZhbHVlKSA/ICh2YWx1ZSBhcyBudW1iZXIpIDogMDtcbn07XG5cbi8qKiBTZXQgb2YgY3VycmVudGx5LWhlbGQgYnV0dG9uIGluZGljZXM7IHVzZWQgZm9yIHJpc2luZy9mYWxsaW5nIGVkZ2UgZGV0ZWN0aW9uLiAqL1xuZXhwb3J0IHR5cGUgQnV0dG9uU25hcHNob3QgPSBSZWNvcmQ8bnVtYmVyLCBib29sZWFuPjtcblxuZXhwb3J0IGNvbnN0IHNuYXBzaG90QnV0dG9ucyA9IChcbiAgZ2FtZXBhZDogR2FtZXBhZExpa2UgfCBudWxsIHwgdW5kZWZpbmVkLFxuKTogQnV0dG9uU25hcHNob3QgPT4ge1xuICBjb25zdCBzbmFwc2hvdDogQnV0dG9uU25hcHNob3QgPSB7fTtcbiAgY29uc3QgYnV0dG9ucyA9IGdhbWVwYWQ/LmJ1dHRvbnMgPz8gW107XG4gIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBidXR0b25zLmxlbmd0aDsgaW5kZXgrKykge1xuICAgIHNuYXBzaG90W2luZGV4XSA9IGlzQnV0dG9uUHJlc3NlZChnYW1lcGFkLCBpbmRleCk7XG4gIH1cbiAgcmV0dXJuIHNuYXBzaG90O1xufTtcblxuLyoqIEJ1dHRvbnMgdGhhdCB3ZW50IGZyb20gdXAgdG8gZG93biBiZXR3ZWVuIHR3byBzbmFwc2hvdHMuICovXG5leHBvcnQgY29uc3QgcmlzaW5nRWRnZXMgPSAoXG4gIHByZXZpb3VzOiBCdXR0b25TbmFwc2hvdCxcbiAgY3VycmVudDogQnV0dG9uU25hcHNob3QsXG4pOiBudW1iZXJbXSA9PiB7XG4gIGNvbnN0IHByZXNzZWQ6IG51bWJlcltdID0gW107XG4gIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGN1cnJlbnQpKSB7XG4gICAgaWYgKHZhbHVlICYmICFwcmV2aW91c1tOdW1iZXIoa2V5KV0pIHByZXNzZWQucHVzaChOdW1iZXIoa2V5KSk7XG4gIH1cbiAgcmV0dXJuIHByZXNzZWQ7XG59O1xuXG4vKipcbiAqIFdhdGNoZXMgYSBnYW1lcGFkIGZvciB0aGUgZmlyc3QgYnV0dG9uIHByZXNzIG9yIGZ1bGwgYXhpcyBkZWZsZWN0aW9uLCBmb3IgdGhlXG4gKiBcInByZXNzIGEgYnV0dG9uXHUyMDI2XCIgZmxvdyBpbiB0aGUgb3B0aW9ucyB3aW5kb3cuIFJldHVybnMgYG51bGxgIHdoaWxlIGlkbGUgc28gYVxuICogY2FsbGVyIGNhbiBrZWVwIHBvbGxpbmcuXG4gKi9cbmV4cG9ydCBjb25zdCBkZXRlY3RHYW1lcGFkQmluZGluZyA9IChcbiAgZ2FtZXBhZDogR2FtZXBhZExpa2UgfCBudWxsIHwgdW5kZWZpbmVkLFxuICBvcHRpb25zOiB7IGFsbG93QXhlcz86IGJvb2xlYW47IGF4aXNUaHJlc2hvbGQ/OiBudW1iZXIgfSA9IHt9LFxuKTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gIGlmICghZ2FtZXBhZCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGJ1dHRvbnMgPSBnYW1lcGFkLmJ1dHRvbnMgPz8gW107XG4gIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBidXR0b25zLmxlbmd0aDsgaW5kZXgrKykge1xuICAgIGlmIChpc0J1dHRvblByZXNzZWQoZ2FtZXBhZCwgaW5kZXgpKSByZXR1cm4gZ2FtZXBhZEJ1dHRvbkJpbmRpbmcoaW5kZXgpO1xuICB9XG4gIGlmIChvcHRpb25zLmFsbG93QXhlcykge1xuICAgIGNvbnN0IHRocmVzaG9sZCA9IG9wdGlvbnMuYXhpc1RocmVzaG9sZCA/PyBBWElTX0NBUFRVUkVfVEhSRVNIT0xEO1xuICAgIGNvbnN0IGF4ZXMgPSBnYW1lcGFkLmF4ZXMgPz8gW107XG4gICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IGF4ZXMubGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgICBpZiAoTWF0aC5hYnMoYXhlc1tpbmRleF0gPz8gMCkgPj0gdGhyZXNob2xkKSB7XG4gICAgICAgIHJldHVybiBnYW1lcGFkQXhpc0JpbmRpbmcoaW5kZXgpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gbnVsbDtcbn07XG5cbi8qKiBBbmFsb2cgbG9vayBpcyBleHByZXNzZWQgaW4gdGhlIHNhbWUgdW5pdHMgdGhlIG1vdXNlIGxvb2sgaGFuZGxlciBjb25zdW1lcy4gKi9cbmV4cG9ydCBjb25zdCBMT09LX1BJWEVMU19QRVJfU0VDT05EID0gOTAwO1xuXG4vKiogSG90IGJ1dHRvbiBhY3Rpb25zIHRoZSBELXBhZCBkcml2ZXMsIGluIGhvdCBidXR0b24gb3JkZXIuICovXG5leHBvcnQgY29uc3QgSE9US0VZX0FDVElPTlM6IHJlYWRvbmx5IEdhbWVwYWREaWdpdGFsQWN0aW9uW10gPSBbXG4gICdob3RrZXkxJyxcbiAgJ2hvdGtleTInLFxuICAnaG90a2V5MycsXG4gICdob3RrZXk0Jyxcbl07XG5cbi8qKiBIb2xkaW5nIHRoZSBtb2RpZmllciBzaGlmdHMgdGhlIGhvdCBidXR0b24gcm93IGJ5IHRoaXMgbWFueSBzbG90cy4gKi9cbmV4cG9ydCBjb25zdCBIT1RLRVlfTU9ESUZJRVJfT0ZGU0VUID0gNDtcblxuLyoqIEV2ZXJ5dGhpbmcgb25lIHBvbGxlZCBmcmFtZSBvZiBhIGNvbnRyb2xsZXIgbWVhbnMsIHdpdGggbm8gc2lkZSBlZmZlY3RzLiAqL1xuZXhwb3J0IGludGVyZmFjZSBHYW1lcGFkU2FtcGxlIHtcbiAgLyoqIC0xLi4xLCB3aGVyZSBmb3J3YXJkIG9uIHRoZSBzdGljayByZWFkcyBuZWdhdGl2ZSwgbWF0Y2hpbmcgdGhlIGtleSBwYXRoLiAqL1xuICBtb3ZlOiB7IGZvcndhcmQ6IG51bWJlcjsgc3RyYWZlOiBudW1iZXIgfTtcbiAgLyoqIENhbWVyYSBkZWx0YSBpbiBtb3VzZS1lcXVpdmFsZW50IHBpeGVscyBmb3IgdGhpcyBmcmFtZS4gKi9cbiAgbG9vazogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9O1xuICBzcHJpbnQ6IGJvb2xlYW47XG4gIGNyb3VjaDogYm9vbGVhbjtcbiAganVtcDogYm9vbGVhbjtcbiAgLyoqIE5vbi1ob3RrZXkgYWN0aW9ucyB3aG9zZSBidXR0b24gd2VudCBkb3duIHRoaXMgZnJhbWUuICovXG4gIGFjdGlvbnM6IEdhbWVwYWREaWdpdGFsQWN0aW9uW107XG4gIC8qKiBaZXJvLWJhc2VkIGhvdCBidXR0b24gc2xvdHMgdHJpZ2dlcmVkIHRoaXMgZnJhbWUuICovXG4gIGhvdGtleXM6IG51bWJlcltdO1xuICAvKiogRmVlZCBiYWNrIGluIGFzIGBwcmV2aW91c0J1dHRvbnNgIG9uIHRoZSBuZXh0IGNhbGwuICovXG4gIGJ1dHRvbnM6IEJ1dHRvblNuYXBzaG90O1xufVxuXG5leHBvcnQgY29uc3QgZW1wdHlHYW1lcGFkU2FtcGxlID0gKCk6IEdhbWVwYWRTYW1wbGUgPT4gKHtcbiAgbW92ZTogeyBmb3J3YXJkOiAwLCBzdHJhZmU6IDAgfSxcbiAgbG9vazogeyB4OiAwLCB5OiAwIH0sXG4gIHNwcmludDogZmFsc2UsXG4gIGNyb3VjaDogZmFsc2UsXG4gIGp1bXA6IGZhbHNlLFxuICBhY3Rpb25zOiBbXSxcbiAgaG90a2V5czogW10sXG4gIGJ1dHRvbnM6IHt9LFxufSk7XG5cbnR5cGUgQmluZGluZ01hcCA9IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG5cbmludGVyZmFjZSBTYW1wbGVTZXR0aW5ncyB7XG4gIGRlYWR6b25lOiBudW1iZXI7XG4gIGxvb2tTZW5zaXRpdml0eTogbnVtYmVyO1xuICBpbnZlcnRMb29rWTogYm9vbGVhbjtcbiAgaW52ZXJ0TW92ZVk6IGJvb2xlYW47XG59XG5cbi8qKlxuICogVHVybnMgb25lIGZyYW1lIG9mIHJhdyBjb250cm9sbGVyIHN0YXRlIGludG8gdGhlIG1vdmVtZW50LCBsb29rIGFuZCBhY3Rpb25cbiAqIGVkZ2VzIHRoZSBwbGF5ZXIgc3lzdGVtcyBjb25zdW1lLiBQdXJlIHNvIHRoZSBtYXBwaW5nIGNhbiBiZSB0ZXN0ZWQgd2l0aG91dFxuICogYSBzY2VuZSwgYW5kIHNvIHJlcGxheWluZyByZWNvcmRlZCBwYWQgc3RhdGVzIGlzIGRldGVybWluaXN0aWMuXG4gKi9cbmV4cG9ydCBjb25zdCBzYW1wbGVHYW1lcGFkID0gKFxuICBnYW1lcGFkOiBHYW1lcGFkTGlrZSB8IG51bGwgfCB1bmRlZmluZWQsXG4gIGJpbmRpbmdzOiBCaW5kaW5nTWFwLFxuICBzZXR0aW5nczogU2FtcGxlU2V0dGluZ3MsXG4gIHByZXZpb3VzQnV0dG9uczogQnV0dG9uU25hcHNob3QsXG4gIGRlbHRhOiBudW1iZXIsXG4pOiBHYW1lcGFkU2FtcGxlID0+IHtcbiAgaWYgKCFnYW1lcGFkKSByZXR1cm4gZW1wdHlHYW1lcGFkU2FtcGxlKCk7XG5cbiAgY29uc3Qgc3RpY2sgPSBhcHBseVN0aWNrRGVhZHpvbmUoXG4gICAgcmVhZEF4aXMoZ2FtZXBhZCwgcGFyc2VBeGlzQmluZGluZyhiaW5kaW5ncy5tb3ZlQXhpc1gpKSxcbiAgICByZWFkQXhpcyhnYW1lcGFkLCBwYXJzZUF4aXNCaW5kaW5nKGJpbmRpbmdzLm1vdmVBeGlzWSkpLFxuICAgIHNldHRpbmdzLmRlYWR6b25lLFxuICApO1xuICBjb25zdCBsb29rWCA9IGFwcGx5RGVhZHpvbmUoXG4gICAgcmVhZEF4aXMoZ2FtZXBhZCwgcGFyc2VBeGlzQmluZGluZyhiaW5kaW5ncy5sb29rQXhpc1gpKSxcbiAgICBzZXR0aW5ncy5kZWFkem9uZSxcbiAgKTtcbiAgY29uc3QgbG9va1kgPSBhcHBseURlYWR6b25lKFxuICAgIHJlYWRBeGlzKGdhbWVwYWQsIHBhcnNlQXhpc0JpbmRpbmcoYmluZGluZ3MubG9va0F4aXNZKSksXG4gICAgc2V0dGluZ3MuZGVhZHpvbmUsXG4gICk7XG5cbiAgLy8gU3F1YXJpbmcga2VlcHMgc21hbGwgZGVmbGVjdGlvbnMgcHJlY2lzZSB3aGlsZSBsZWF2aW5nIGZ1bGwgZGVmbGVjdGlvbiBhdFxuICAvLyB0aGUgY29uZmlndXJlZCB0b3Agc3BlZWQuXG4gIGNvbnN0IGxvb2tTY2FsZSA9IExPT0tfUElYRUxTX1BFUl9TRUNPTkQgKiBzZXR0aW5ncy5sb29rU2Vuc2l0aXZpdHkgKiBkZWx0YTtcbiAgY29uc3Qgc2NhbGVkTG9va1kgPSBNYXRoLnNpZ24obG9va1kpICogbG9va1kgKiBsb29rWSAqIGxvb2tTY2FsZTtcblxuICBjb25zdCBoZWxkID0gKGFjdGlvbjogR2FtZXBhZERpZ2l0YWxBY3Rpb24pID0+XG4gICAgaXNCdXR0b25QcmVzc2VkKGdhbWVwYWQsIHBhcnNlQnV0dG9uQmluZGluZyhiaW5kaW5nc1thY3Rpb25dKSk7XG5cbiAgY29uc3QgYnV0dG9ucyA9IHNuYXBzaG90QnV0dG9ucyhnYW1lcGFkKTtcbiAgY29uc3QgcHJlc3NlZCA9IHJpc2luZ0VkZ2VzKHByZXZpb3VzQnV0dG9ucywgYnV0dG9ucyk7XG4gIGNvbnN0IG1vZGlmaWVySGVsZCA9IGhlbGQoJ2hvdGtleU1vZGlmaWVyJyk7XG5cbiAgY29uc3QgYWN0aW9uczogR2FtZXBhZERpZ2l0YWxBY3Rpb25bXSA9IFtdO1xuICBjb25zdCBob3RrZXlzOiBudW1iZXJbXSA9IFtdO1xuICBmb3IgKGNvbnN0IGJ1dHRvbiBvZiBwcmVzc2VkKSB7XG4gICAgY29uc3QgaG90a2V5U2xvdCA9IEhPVEtFWV9BQ1RJT05TLmZpbmRJbmRleChcbiAgICAgIChhY3Rpb24pID0+IHBhcnNlQnV0dG9uQmluZGluZyhiaW5kaW5nc1thY3Rpb25dKSA9PT0gYnV0dG9uLFxuICAgICk7XG4gICAgaWYgKGhvdGtleVNsb3QgPj0gMCkge1xuICAgICAgaG90a2V5cy5wdXNoKFxuICAgICAgICBtb2RpZmllckhlbGQgPyBob3RrZXlTbG90ICsgSE9US0VZX01PRElGSUVSX09GRlNFVCA6IGhvdGtleVNsb3QsXG4gICAgICApO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGZvciAoY29uc3QgW2FjdGlvbiwgYmluZGluZ10gb2YgT2JqZWN0LmVudHJpZXMoYmluZGluZ3MpKSB7XG4gICAgICBpZiAocGFyc2VCdXR0b25CaW5kaW5nKGJpbmRpbmcpID09PSBidXR0b24pIHtcbiAgICAgICAgYWN0aW9ucy5wdXNoKGFjdGlvbiBhcyBHYW1lcGFkRGlnaXRhbEFjdGlvbik7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBtb3ZlOiB7XG4gICAgICBmb3J3YXJkOiBzZXR0aW5ncy5pbnZlcnRNb3ZlWSA/IC1zdGljay55IDogc3RpY2sueSxcbiAgICAgIHN0cmFmZTogc3RpY2sueCxcbiAgICB9LFxuICAgIGxvb2s6IHtcbiAgICAgIHg6IE1hdGguc2lnbihsb29rWCkgKiBsb29rWCAqIGxvb2tYICogbG9va1NjYWxlLFxuICAgICAgeTogc2V0dGluZ3MuaW52ZXJ0TG9va1kgPyAtc2NhbGVkTG9va1kgOiBzY2FsZWRMb29rWSxcbiAgICB9LFxuICAgIHNwcmludDogaGVsZCgnc3ByaW50JyksXG4gICAgY3JvdWNoOiBoZWxkKCdjcm91Y2gnKSxcbiAgICBqdW1wOiBoZWxkKCdqdW1wJyksXG4gICAgYWN0aW9ucyxcbiAgICBob3RrZXlzLFxuICAgIGJ1dHRvbnMsXG4gIH07XG59O1xuXG4vKiogUGlja3MgdGhlIGdhbWVwYWQgd2Ugc2hvdWxkIGRyaXZlIHRoZSBwbGF5ZXIgd2l0aC4gKi9cbmV4cG9ydCBjb25zdCBzZWxlY3RBY3RpdmVHYW1lcGFkID0gKFxuICBnYW1lcGFkczogcmVhZG9ubHkgKEdhbWVwYWRMaWtlIHwgbnVsbClbXSB8IG51bGwgfCB1bmRlZmluZWQsXG4gIHByZWZlcnJlZEluZGV4OiBudW1iZXIgfCBudWxsID0gbnVsbCxcbik6IEdhbWVwYWRMaWtlIHwgbnVsbCA9PiB7XG4gIGNvbnN0IGxpc3QgPSBnYW1lcGFkcyA/PyBbXTtcbiAgaWYgKHByZWZlcnJlZEluZGV4ICE9PSBudWxsKSB7XG4gICAgY29uc3QgcHJlZmVycmVkID0gbGlzdFtwcmVmZXJyZWRJbmRleF07XG4gICAgaWYgKHByZWZlcnJlZCAmJiBwcmVmZXJyZWQuY29ubmVjdGVkICE9PSBmYWxzZSkgcmV0dXJuIHByZWZlcnJlZDtcbiAgfVxuICBmb3IgKGNvbnN0IGdhbWVwYWQgb2YgbGlzdCkge1xuICAgIGlmIChnYW1lcGFkICYmIGdhbWVwYWQuY29ubmVjdGVkICE9PSBmYWxzZSkgcmV0dXJuIGdhbWVwYWQ7XG4gIH1cbiAgcmV0dXJuIG51bGw7XG59O1xuIiwgIi8vIEZpbGU6IGNsaWVudC9lMmUvaGFybmVzcy9nYW1lcGFkLWhhcm5lc3MudHNcbi8vXG4vLyBFeHBvc2VzIHRoZSBjb250cm9sbGVyIG1hcHBpbmcgdG8gUGxheXdyaWdodC4gT25seSB0aGUgcHVyZSBtb2R1bGVzIGFyZVxuLy8gcHVsbGVkIGluLCBzbyB0aGUgaGFybmVzcyBydW5zIHdpdGhvdXQgYSBzY2VuZSwgYSBzb2NrZXQgb3IgYSB6b25lLlxuaW1wb3J0IHsgREVGQVVMVF9HQU1FUEFEX0JJTkRJTkdTLCBERUZBVUxUX0dBTUVQQURfU0VUVElOR1MgfSBmcm9tICdAZ2FtZS9Db25maWcvY29uZmlnJztcbmltcG9ydCB7XG4gIGFwcGx5RGVhZHpvbmUsXG4gIGFwcGx5U3RpY2tEZWFkem9uZSxcbiAgZGV0ZWN0R2FtZXBhZEJpbmRpbmcsXG4gIGVtcHR5R2FtZXBhZFNhbXBsZSxcbiAgcHJlc2VudEdhbWVwYWRCaW5kaW5nLFxuICBzYW1wbGVHYW1lcGFkLFxuICBzZWxlY3RBY3RpdmVHYW1lcGFkLFxuICB0eXBlIEJ1dHRvblNuYXBzaG90LFxuICB0eXBlIEdhbWVwYWRMaWtlLFxuICB0eXBlIEdhbWVwYWRTYW1wbGUsXG59IGZyb20gJ0BnYW1lL0NvbmZpZy9nYW1lcGFkLWJpbmRpbmdzJztcblxudHlwZSBPdmVycmlkZXMgPSB7XG4gIGJpbmRpbmdzPzogUGFydGlhbDxSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+PjtcbiAgc2V0dGluZ3M/OiBQYXJ0aWFsPHR5cGVvZiBERUZBVUxUX0dBTUVQQURfU0VUVElOR1M+O1xufTtcblxuY29uc3QgYmluZGluZ3NXaXRoID0gKG92ZXJyaWRlcz86IE92ZXJyaWRlcykgPT4gKHtcbiAgLi4uREVGQVVMVF9HQU1FUEFEX0JJTkRJTkdTLFxuICAuLi5vdmVycmlkZXM/LmJpbmRpbmdzLFxufSk7XG5cbmNvbnN0IHNldHRpbmdzV2l0aCA9IChvdmVycmlkZXM/OiBPdmVycmlkZXMpID0+ICh7XG4gIC4uLkRFRkFVTFRfR0FNRVBBRF9TRVRUSU5HUyxcbiAgLi4ub3ZlcnJpZGVzPy5zZXR0aW5ncyxcbn0pO1xuXG4vKiogUmVwbGF5cyBhIHNlcXVlbmNlIG9mIHBhZCBmcmFtZXMsIGNhcnJ5aW5nIGVkZ2Ugc3RhdGUgYmV0d2VlbiB0aGVtLiAqL1xuY29uc3QgcmVwbGF5ID0gKFxuICBmcmFtZXM6IEdhbWVwYWRMaWtlW10sXG4gIG92ZXJyaWRlcz86IE92ZXJyaWRlcyxcbiAgZGVsdGEgPSAxIC8gNjAsXG4pOiBHYW1lcGFkU2FtcGxlW10gPT4ge1xuICBjb25zdCBiaW5kaW5ncyA9IGJpbmRpbmdzV2l0aChvdmVycmlkZXMpO1xuICBjb25zdCBzZXR0aW5ncyA9IHNldHRpbmdzV2l0aChvdmVycmlkZXMpO1xuICBsZXQgcHJldmlvdXM6IEJ1dHRvblNuYXBzaG90ID0ge307XG4gIHJldHVybiBmcmFtZXMubWFwKChmcmFtZSkgPT4ge1xuICAgIGNvbnN0IHNhbXBsZSA9IHNhbXBsZUdhbWVwYWQoZnJhbWUsIGJpbmRpbmdzLCBzZXR0aW5ncywgcHJldmlvdXMsIGRlbHRhKTtcbiAgICBwcmV2aW91cyA9IHNhbXBsZS5idXR0b25zO1xuICAgIHJldHVybiBzYW1wbGU7XG4gIH0pO1xufTtcblxuY29uc3QgaGFybmVzcyA9IHtcbiAgYXBwbHlEZWFkem9uZSxcbiAgYXBwbHlTdGlja0RlYWR6b25lLFxuICBkZXRlY3RHYW1lcGFkQmluZGluZyxcbiAgZW1wdHlHYW1lcGFkU2FtcGxlLFxuICBwcmVzZW50R2FtZXBhZEJpbmRpbmcsXG4gIHNlbGVjdEFjdGl2ZUdhbWVwYWQsXG4gIGRlZmF1bHRzOiB7XG4gICAgYmluZGluZ3M6IERFRkFVTFRfR0FNRVBBRF9CSU5ESU5HUyxcbiAgICBzZXR0aW5nczogREVGQVVMVF9HQU1FUEFEX1NFVFRJTkdTLFxuICB9LFxuICBzYW1wbGU6IChcbiAgICBnYW1lcGFkOiBHYW1lcGFkTGlrZSB8IG51bGwsXG4gICAgb3ZlcnJpZGVzPzogT3ZlcnJpZGVzLFxuICAgIHByZXZpb3VzOiBCdXR0b25TbmFwc2hvdCA9IHt9LFxuICAgIGRlbHRhID0gMSAvIDYwLFxuICApID0+XG4gICAgc2FtcGxlR2FtZXBhZChcbiAgICAgIGdhbWVwYWQsXG4gICAgICBiaW5kaW5nc1dpdGgob3ZlcnJpZGVzKSxcbiAgICAgIHNldHRpbmdzV2l0aChvdmVycmlkZXMpLFxuICAgICAgcHJldmlvdXMsXG4gICAgICBkZWx0YSxcbiAgICApLFxuICByZXBsYXksXG4gIC8qKiBSZWFkcyB3aGF0ZXZlciBgbmF2aWdhdG9yLmdldEdhbWVwYWRzKClgIGN1cnJlbnRseSByZXBvcnRzLiAqL1xuICBwb2xsOiAob3ZlcnJpZGVzPzogT3ZlcnJpZGVzLCBwcmV2aW91czogQnV0dG9uU25hcHNob3QgPSB7fSwgZGVsdGEgPSAxIC8gNjApID0+XG4gICAgc2FtcGxlR2FtZXBhZChcbiAgICAgIHNlbGVjdEFjdGl2ZUdhbWVwYWQoXG4gICAgICAgIEFycmF5LmZyb20obmF2aWdhdG9yLmdldEdhbWVwYWRzPy4oKSA/PyBbXSkgYXMgKEdhbWVwYWRMaWtlIHwgbnVsbClbXSxcbiAgICAgICksXG4gICAgICBiaW5kaW5nc1dpdGgob3ZlcnJpZGVzKSxcbiAgICAgIHNldHRpbmdzV2l0aChvdmVycmlkZXMpLFxuICAgICAgcHJldmlvdXMsXG4gICAgICBkZWx0YSxcbiAgICApLFxufTtcblxuZGVjbGFyZSBnbG9iYWwge1xuICBpbnRlcmZhY2UgV2luZG93IHtcbiAgICBnYW1lcGFkSGFybmVzczogdHlwZW9mIGhhcm5lc3M7XG4gIH1cbn1cblxud2luZG93LmdhbWVwYWRIYXJuZXNzID0gaGFybmVzcztcblxuZXhwb3J0IGRlZmF1bHQgaGFybmVzcztcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozt3QkE4Q0NBLEdBQUFBO0FBT0EsV0FBTyxFQUlOQSxLQU5EQSxJQUFNQSxLQUFPLG9CQUFJQyxPQWNoQkMsSUFBQUEsU0FBNkJDLEdBQVdDLEdBQUFBO0FBQ3ZDLFVBQU1DLElBQW1ETCxFQUFLTSxJQUFJSCxDQUFBQTtBQUM5REUsVUFDSEEsRUFBU0UsS0FBS0gsQ0FBQUEsSUFFZEosRUFBS1EsSUFBSUwsR0FBTSxDQUFDQyxDQUFBQSxDQUFBQTtJQUFBQSxHQVdsQkssS0FBQUEsU0FBOEJOLEdBQVdDLEdBQUFBO0FBQ3hDLFVBQU1DLElBQW1ETCxFQUFLTSxJQUFJSCxDQUFBQTtBQUM5REUsWUFDQ0QsSUFDSEMsRUFBU0ssT0FBT0wsRUFBU00sUUFBUVAsQ0FBQUEsTUFBYSxHQUFHLENBQUEsSUFFakRKLEVBQUtRLElBQUlMLEdBQU0sQ0FBQSxDQUFBO0lBQUEsR0FlbEJTLE1BQUFBLFNBQStCVCxHQUFXVSxHQUFBQTtBQUN6QyxVQUFJUixJQUFXTCxFQUFLTSxJQUFJSCxDQUFBQTtBQUNwQkUsV0FDRkEsRUFDQ1MsTUFBQUEsRUFDQUMsSUFBSSxTQUFDWCxJQUFBQTtBQUNMQSxRQUFBQSxHQUFRUyxDQUFBQTtNQUFBQSxDQUFBQSxJQUlYUixJQUFXTCxFQUFLTSxJQUFJLEdBQUEsTUFFbEJELEVBQ0NTLE1BQUFBLEVBQ0FDLElBQUksU0FBQ1gsSUFBQUE7QUFDTEEsUUFBQUEsR0FBUUQsR0FBTVUsQ0FBQUE7TUFBQUEsQ0FBQUE7SUFBQUEsRUFBQUE7RUFBQUE7OztBQ3ZCYixNQUFNLFVBQ1gsYUFBYTtBQUVmLFVBQVEsT0FBTyxDQUNiLE1BQ0EsWUFDRztBQUNILFVBQU0sY0FBYyxDQUFDLFVBQXFCO0FBQ3hDLGNBQVEsS0FBSztBQUNiLGNBQVEsSUFBSSxNQUFNLFdBQVc7QUFBQSxJQUMvQjtBQUNBLFlBQVEsR0FBRyxNQUFNLFdBQVc7QUFBQSxFQUM5QjtBQUVBLE1BQU8saUJBQVE7OztBQzFGZixNQUFNLGdCQUFnQjtBQUN0QixNQUFNLHNCQUFzQjtBQUM1QixNQUFNLHNCQUFzQjtBQUM1QixNQUFNLDRCQUE0QjtBQUUzQixNQUFNLHNCQUFnRDtBQUFBLElBQzNELFFBQVEsRUFBRSxHQUFHLE9BQU8sR0FBRyxPQUFPLE9BQU8sS0FBSyxRQUFRLEtBQUssR0FBRyxFQUFFO0FBQUEsSUFDNUQsUUFBUSxFQUFFLEdBQUcsT0FBTyxHQUFHLE9BQU8sT0FBTyxLQUFLLFFBQVEsS0FBSyxHQUFHLEVBQUU7QUFBQSxJQUM1RCxTQUFTLEVBQUUsR0FBRyxPQUFPLEdBQUcsT0FBTyxPQUFPLEtBQUssUUFBUSxJQUFJLEdBQUcsRUFBRTtBQUFBLElBQzVELFNBQVMsRUFBRSxHQUFHLE1BQU0sR0FBRyxPQUFPLE9BQU8sS0FBSyxRQUFRLEtBQUssR0FBRyxFQUFFO0FBQUEsSUFDNUQsTUFBTSxFQUFFLEdBQUcsT0FBTyxHQUFHLE1BQU0sT0FBTyxLQUFLLFFBQVEsS0FBSyxHQUFHLEVBQUU7QUFBQSxJQUN6RCxVQUFVLEVBQUUsR0FBRyxPQUFPLEdBQUcsTUFBTSxPQUFPLEtBQUssUUFBUSxLQUFLLEdBQUcsRUFBRTtBQUFBLEVBQy9EO0FBT08sTUFBTSwyQkFBNEM7QUFBQSxJQUN2RCxXQUFXO0FBQUEsSUFDWCxXQUFXO0FBQUEsSUFDWCxXQUFXO0FBQUEsSUFDWCxXQUFXO0FBQUEsSUFFWCxNQUFNO0FBQUEsSUFDTixVQUFVO0FBQUEsSUFDVixNQUFNO0FBQUEsSUFDTixVQUFVO0FBQUEsSUFDVixnQkFBZ0I7QUFBQSxJQUNoQixlQUFlO0FBQUEsSUFDZixRQUFRO0FBQUEsSUFDUixZQUFZO0FBQUEsSUFDWixXQUFXO0FBQUEsSUFDWCxTQUFTO0FBQUEsSUFDVCxTQUFTO0FBQUEsSUFDVCxjQUFjO0FBQUEsSUFDZCxTQUFTO0FBQUEsSUFDVCxTQUFTO0FBQUEsSUFDVCxTQUFTO0FBQUEsSUFDVCxTQUFTO0FBQUEsSUFDVCxRQUFRO0FBQUEsSUFDUixhQUFhO0FBQUEsRUFDZjtBQUVPLE1BQU0sMkJBQTRDO0FBQUEsSUFDdkQsU0FBUztBQUFBLElBQ1QsVUFBVTtBQUFBLElBQ1YsaUJBQWlCO0FBQUEsSUFDakIsYUFBYTtBQUFBLElBQ2IsYUFBYTtBQUFBLElBQ2IsV0FBVztBQUFBLEVBQ2I7QUFFTyxNQUFNLGlCQUF5QjtBQUFBLElBQ3BDLGFBQWE7QUFBQSxNQUNYLGFBQWE7QUFBQSxNQUNiLGNBQWM7QUFBQSxNQUNkLFVBQVU7QUFBQSxNQUNWLFdBQVc7QUFBQSxNQUNYLFFBQVE7QUFBQSxNQUNSLFFBQVE7QUFBQSxNQUNSLE1BQU07QUFBQSxNQUNOLFVBQVU7QUFBQSxNQUNWLE1BQU07QUFBQSxNQUNOLFVBQVU7QUFBQSxNQUNWLGVBQWU7QUFBQSxNQUNmLGdCQUFnQjtBQUFBLE1BQ2hCLFdBQVc7QUFBQSxNQUNYLFFBQVE7QUFBQSxNQUNSLFlBQVk7QUFBQSxNQUNaLFNBQVM7QUFBQTtBQUFBLE1BR1QsT0FBTztBQUFBO0FBQUEsTUFFUCxTQUFTO0FBQUE7QUFBQSxNQUdULFNBQVM7QUFBQSxNQUNULFNBQVM7QUFBQSxNQUNULFNBQVM7QUFBQSxNQUNULFNBQVM7QUFBQSxNQUNULFNBQVM7QUFBQSxNQUNULFNBQVM7QUFBQSxNQUNULFNBQVM7QUFBQSxNQUNULFNBQVM7QUFBQSxNQUNULFNBQVM7QUFBQSxNQUNULFVBQVU7QUFBQSxJQUNaO0FBQUEsSUFDQSxpQkFBaUIsZ0JBQWdCLHdCQUF3QjtBQUFBLElBQ3pELFNBQVMsRUFBRSxHQUFHLHlCQUF5QjtBQUFBLElBQ3ZDLFVBQVU7QUFBQSxNQUNSLFdBQVc7QUFBQSxNQUNYLE9BQU87QUFBQSxNQUNQLE9BQU87QUFBQSxNQUNQLGFBQWE7QUFBQSxNQUNiLGFBQWE7QUFBQSxJQUNmO0FBQUEsSUFDQSxJQUFJO0FBQUEsTUFDRixPQUFPO0FBQUEsTUFDUCxVQUFVO0FBQUEsTUFDVixjQUFjO0FBQUEsTUFDZCxTQUFTO0FBQUEsTUFDVCxXQUFXO0FBQUEsTUFDWCxZQUFZLGdCQUFnQixtQkFBbUI7QUFBQSxJQUNqRDtBQUFBLElBQ0EsWUFBWTtBQUFBLE1BQ1YsR0FBRztBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsUUFDQSxPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsTUFDVDtBQUFBLE1BQ0EsS0FBSztBQUFBLFFBQ0g7QUFBQSxRQUNBO0FBQUEsUUFDQSxPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsUUFDUCxNQUFNLENBQUMsT0FBTztBQUFBLFFBQ2QsT0FBTztBQUFBLE1BQ1Q7QUFBQSxNQUNBLEtBQUs7QUFBQSxRQUNILE1BQU07QUFBQSxNQUNSO0FBQUEsTUFDQSxLQUFLO0FBQUEsUUFDSDtBQUFBLFFBQ0E7QUFBQSxRQUNBLE9BQU87QUFBQSxRQUNQLE9BQU87QUFBQSxRQUNQLE1BQU0sQ0FBQyxXQUFXO0FBQUEsUUFDbEIsT0FBTztBQUFBLE1BQ1Q7QUFBQSxNQUNBLEtBQUs7QUFBQSxRQUNILE1BQU07QUFBQSxNQUNSO0FBQUEsTUFDQSxLQUFLO0FBQUEsUUFDSCxNQUFNO0FBQUEsTUFDUjtBQUFBLE1BQ0EsS0FBSztBQUFBLFFBQ0gsTUFBTTtBQUFBLE1BQ1I7QUFBQSxJQUNGO0FBQUEsSUFDQSxlQUFlO0FBQUEsTUFDYixHQUFHO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxRQUNBLE9BQU87QUFBQSxNQUNUO0FBQUEsTUFDQSxHQUFHO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxRQUNBLE9BQU87QUFBQSxNQUNUO0FBQUEsSUFDRjtBQUFBLElBQ0EsZUFBZTtBQUFBLE1BQ2IsR0FBRztBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsUUFDQSxPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsUUFDUCxNQUFNLENBQUMsT0FBTztBQUFBLE1BQ2hCO0FBQUEsTUFDQSxHQUFHO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxRQUNBLE9BQU87QUFBQSxRQUNQLE9BQU87QUFBQSxRQUNQLE1BQU0sQ0FBQyxXQUFXO0FBQUEsTUFDcEI7QUFBQSxNQUNBLEdBQUc7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFFBQ0EsT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLFFBQ1AsTUFBTSxDQUFDLE1BQU07QUFBQSxNQUNmO0FBQUEsSUFDRjtBQUFBLElBQ0EsZ0JBQWdCLENBQUM7QUFBQSxFQUNuQjtBQUVPLFdBQVMsWUFBWSxZQUE0QztBQUN0RSxXQUFPO0FBQUEsTUFDTCxhQUFhO0FBQUEsUUFDWCxHQUFHLGVBQWU7QUFBQSxRQUNsQixHQUFHLFlBQVk7QUFBQSxNQUNqQjtBQUFBLE1BQ0EsaUJBQWlCO0FBQUEsUUFDZixHQUFHLGVBQWU7QUFBQSxRQUNsQixHQUFHLFlBQVk7QUFBQSxNQUNqQjtBQUFBLE1BQ0EsU0FBUztBQUFBLFFBQ1AsR0FBRyxlQUFlO0FBQUEsUUFDbEIsR0FBRyxZQUFZO0FBQUEsTUFDakI7QUFBQSxNQUNBLFVBQVU7QUFBQSxRQUNSLEdBQUcsZUFBZTtBQUFBLFFBQ2xCLEdBQUcsWUFBWTtBQUFBLE1BQ2pCO0FBQUEsTUFDQSxJQUFJO0FBQUEsUUFDRixHQUFHLGVBQWU7QUFBQSxRQUNsQixHQUFHLFlBQVk7QUFBQSxRQUNmLFlBQVk7QUFBQSxVQUNWLEdBQUcsZUFBZSxHQUFHO0FBQUEsVUFDckIsR0FBRyxZQUFZLElBQUk7QUFBQSxRQUNyQjtBQUFBLE1BQ0Y7QUFBQSxNQUNBLFlBQVk7QUFBQSxRQUNWLEdBQUcsZUFBZTtBQUFBLFFBQ2xCLEdBQUcsWUFBWTtBQUFBLE1BQ2pCO0FBQUEsTUFDQSxlQUFlO0FBQUEsUUFDYixHQUFHLGVBQWU7QUFBQSxRQUNsQixHQUFHLFlBQVk7QUFBQSxNQUNqQjtBQUFBLE1BQ0EsZUFBZTtBQUFBLFFBQ2IsR0FBRyxlQUFlO0FBQUEsUUFDbEIsR0FBRyxZQUFZO0FBQUEsTUFDakI7QUFBQSxNQUNBLGdCQUFnQjtBQUFBLFFBQ2QsR0FBRyxlQUFlO0FBQUEsUUFDbEIsR0FBRyxZQUFZO0FBQUEsTUFDakI7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUVPLE1BQU0sYUFBTixNQUFNLFlBQVc7QUFBQSxJQUN0QixPQUFlO0FBQUEsSUFDUDtBQUFBLElBQ0EsaUJBQWlCO0FBQUEsSUFFekIsTUFBYyxvQkFDWixRQUNBLGdCQUFnQixxQkFDc0I7QUFDdEMsVUFBSSxDQUFDLFVBQVUsU0FBUyxnQkFBZ0IsQ0FBQyxLQUFLLGVBQWdCLFFBQU87QUFDckUsWUFBTSxPQUFPLE1BQU0sVUFBVSxRQUFRLGFBQWE7QUFDbEQsVUFBSSxZQUF1QztBQUMzQyxpQkFBVyxXQUFXLGNBQWMsTUFBTSxHQUFHLEdBQUc7QUFDOUMsb0JBQVksTUFBTSxVQUFVLG1CQUFtQixTQUFTLEVBQUUsT0FBTyxDQUFDO0FBQUEsTUFDcEU7QUFDQSxhQUFPLFVBQVUsY0FBYyxLQUFLLGdCQUFnQixFQUFFLE9BQU8sQ0FBQztBQUFBLElBQ2hFO0FBQUEsSUFFQSxNQUFjLGVBQ1osZ0JBQWdCLHFCQUNpQjtBQUNqQyxVQUFJO0FBQ0YsY0FBTSxTQUFTLE1BQU0sS0FBSyxvQkFBb0IsT0FBTyxhQUFhO0FBQ2xFLFlBQUksQ0FBQyxPQUFRLFFBQU87QUFDcEIsY0FBTSxPQUFPLE1BQU0sT0FBTyxRQUFRO0FBQ2xDLGNBQU0sT0FBTyxNQUFNLEtBQUssS0FBSztBQUM3QixlQUFPLE9BQVEsS0FBSyxNQUFNLElBQUksSUFBd0I7QUFBQSxNQUN4RCxTQUFTLE9BQU87QUFDZCxZQUFJLGlCQUFpQixnQkFBZ0IsTUFBTSxTQUFTLGlCQUFpQjtBQUNuRSxpQkFBTztBQUFBLFFBQ1Q7QUFDQSxnQkFBUTtBQUFBLFVBQ04sOEJBQThCLGFBQWEsSUFBSSxLQUFLLGNBQWM7QUFBQSxVQUNsRTtBQUFBLFFBQ0Y7QUFDQSxlQUFPO0FBQUEsTUFDVDtBQUFBLElBQ0Y7QUFBQSxJQUVBLE1BQWMsZ0JBQWdCLFlBQW1DO0FBQy9ELFlBQU0sU0FBUyxNQUFNLEtBQUssb0JBQW9CLElBQUk7QUFDbEQsVUFBSSxDQUFDLE9BQVE7QUFDYixZQUFNLFdBQVcsTUFBTSxPQUFPLGVBQWU7QUFDN0MsWUFBTSxTQUFTLE1BQU0sVUFBVTtBQUMvQixZQUFNLFNBQVMsTUFBTTtBQUFBLElBQ3ZCO0FBQUEsSUFFUSxjQUFjO0FBQ3BCLFdBQUssU0FBUztBQUNkLHFCQUFRLEdBQUcsZ0JBQWdCLEtBQUssa0JBQWtCLEtBQUssSUFBSSxDQUFDO0FBQUEsSUFDOUQ7QUFBQSxJQUVRLGtCQUFrQixLQUEwQjtBQUNsRCxjQUFRLEtBQUs7QUFBQSxRQUNYLEtBQUs7QUFDSCx5QkFBUSxLQUFLLGdCQUFnQjtBQUM3QjtBQUFBLFFBQ0YsS0FBSztBQUFBLFFBQ0wsS0FBSztBQUNILHlCQUFRLEtBQUssZUFBZTtBQUM1QjtBQUFBLFFBQ0YsS0FBSztBQUNILHlCQUFRLEtBQUssZ0JBQWdCO0FBQzdCO0FBQUEsUUFDRixLQUFLO0FBQ0gseUJBQVEsS0FBSyxVQUFVO0FBQ3ZCO0FBQUEsUUFDRixLQUFLO0FBQ0gseUJBQVEsS0FBSyxrQkFBa0I7QUFDL0I7QUFBQSxRQUNGLEtBQUs7QUFDSCx5QkFBUSxLQUFLLHFCQUFxQjtBQUNsQztBQUFBLFFBQ0YsS0FBSztBQUNILHlCQUFRLEtBQUsscUJBQXFCO0FBQ2xDO0FBQUEsUUFDRixLQUFLO0FBQ0gseUJBQVEsS0FBSyxzQkFBc0I7QUFDbkM7QUFBQSxRQUNGO0FBQ0UseUJBQVEsS0FBSyxnQkFBZ0I7QUFDN0IseUJBQVEsS0FBSyxVQUFVO0FBQ3ZCLHlCQUFRLEtBQUssZ0JBQWdCO0FBQzdCLHlCQUFRLEtBQUssZUFBZTtBQUM1Qix5QkFBUSxLQUFLLGtCQUFrQjtBQUMvQix5QkFBUSxLQUFLLHFCQUFxQjtBQUNsQyx5QkFBUSxLQUFLLHFCQUFxQjtBQUNsQyx5QkFBUSxLQUFLLHNCQUFzQjtBQUFBLE1BQ3ZDO0FBQUEsSUFDRjtBQUFBLElBRUEsTUFBYSxXQUFXLFFBQWdCLFFBQStCO0FBQ3JFLFdBQUssaUJBQWlCLEdBQUcsTUFBTSxJQUFJLE1BQU0sSUFBSSxhQUFhO0FBQzFELFVBQUksYUFBYSxNQUFNLEtBQUssZUFBZTtBQUMzQyxVQUFJLENBQUMsWUFBWTtBQUNmLHFCQUFhLE1BQU0sS0FBSyxlQUFlLHlCQUF5QjtBQUFBLE1BQ2xFO0FBQ0EsVUFBSTtBQUNGLFlBQUksQ0FBQyxZQUFZO0FBQ2YsZ0JBQU0sU0FBUyxhQUFhO0FBQUEsWUFDMUIsR0FBRyxtQkFBbUIsR0FBRyxLQUFLLGNBQWM7QUFBQSxVQUM5QztBQUNBLHVCQUFhLFNBQVUsS0FBSyxNQUFNLE1BQU0sSUFBd0I7QUFBQSxRQUNsRTtBQUFBLE1BQ0YsU0FBUyxPQUFPO0FBQ2QsZ0JBQVEsTUFBTSx5QkFBeUIsS0FBSyxjQUFjLEtBQUssS0FBSztBQUFBLE1BQ3RFO0FBQ0EsY0FBUSxJQUFJLGVBQWUsVUFBVTtBQUNyQyxXQUFLLFNBQVMsWUFBWSxVQUFVO0FBQ3BDLHFCQUFRLEtBQUssY0FBYztBQUMzQixXQUFLLEtBQUs7QUFBQSxJQUNaO0FBQUEsSUFFTyxlQUFlLFFBQWdCLFNBQWlCLFNBQVMsR0FBUztBQUN2RSxZQUFNLE9BQU8sS0FBSyxPQUFPLFdBQVcsTUFBTTtBQUMxQyxXQUFLLE9BQU8sV0FBVyxNQUFNLElBQUksS0FBSyxPQUFPLFdBQVcsTUFBTTtBQUM5RCxVQUFJLFNBQVMsUUFBVztBQUN0QixhQUFLLE9BQU8sV0FBVyxNQUFNLElBQUk7QUFBQSxNQUNuQyxPQUFPO0FBQ0wsZUFBTyxLQUFLLE9BQU8sV0FBVyxNQUFNO0FBQUEsTUFDdEM7QUFDQSxxQkFBUSxLQUFLLGdCQUFnQixZQUFZO0FBQ3pDLFdBQUssS0FBSztBQUFBLElBQ1o7QUFBQSxJQUVPLGdCQUFnQixPQUFlLGNBQXVDO0FBQzNFLFVBQUksY0FBYztBQUNoQixhQUFLLE9BQU8sV0FBVyxLQUFLLElBQUk7QUFBQSxNQUNsQyxPQUFPO0FBQ0wsZUFBTyxLQUFLLE9BQU8sV0FBVyxLQUFLO0FBQUEsTUFDckM7QUFDQSxxQkFBUSxLQUFLLGdCQUFnQixZQUFZO0FBQ3pDLFdBQUssS0FBSztBQUFBLElBQ1o7QUFBQSxJQUVPLG1CQUNMLE9BQ0EsY0FDQTtBQUNBLFVBQUksY0FBYztBQUNoQixhQUFLLE9BQU8sY0FBYyxLQUFLLElBQUk7QUFBQSxNQUNyQyxPQUFPO0FBQ0wsZUFBTyxLQUFLLE9BQU8sY0FBYyxLQUFLO0FBQUEsTUFDeEM7QUFDQSxxQkFBUSxLQUFLLGdCQUFnQixlQUFlO0FBQzVDLFdBQUssS0FBSztBQUFBLElBQ1o7QUFBQSxJQUVPLG1CQUNMLE9BQ0EsY0FDQTtBQUNBLFVBQUksY0FBYztBQUNoQixhQUFLLE9BQU8sY0FBYyxLQUFLLElBQUk7QUFBQSxNQUNyQyxPQUFPO0FBQ0wsZUFBTyxLQUFLLE9BQU8sY0FBYyxLQUFLO0FBQUEsTUFDeEM7QUFDQSxxQkFBUSxLQUFLLGdCQUFnQixlQUFlO0FBQzVDLFdBQUssS0FBSztBQUFBLElBQ1o7QUFBQSxJQUVPLG9CQUNMLE9BQ0EsY0FDQTtBQUNBLFVBQUksY0FBYztBQUNoQixhQUFLLE9BQU8sZUFBZSxLQUFLLElBQUk7QUFBQSxNQUN0QyxPQUFPO0FBQ0wsZUFBTyxLQUFLLE9BQU8sZUFBZSxLQUFLO0FBQUEsTUFDekM7QUFDQSxxQkFBUSxLQUFLLGdCQUFnQixnQkFBZ0I7QUFDN0MsV0FBSyxLQUFLO0FBQUEsSUFDWjtBQUFBLElBRU8sY0FBYyxLQUF3QixPQUFxQjtBQUNoRSxXQUFLLE9BQU8sWUFBWSxHQUFHLElBQUk7QUFDL0IscUJBQVEsS0FBSyxnQkFBZ0IsYUFBYTtBQUMxQyxXQUFLLEtBQUs7QUFBQSxJQUNaO0FBQUEsSUFFTyxnQkFBc0I7QUFDM0IsV0FBSyxPQUFPLGNBQWMsRUFBRSxHQUFHLGVBQWUsWUFBWTtBQUMxRCxxQkFBUSxLQUFLLGdCQUFnQixhQUFhO0FBQzFDLFdBQUssS0FBSztBQUFBLElBQ1o7QUFBQSxJQUVPLHFCQUNMLEtBQ0EsT0FDTTtBQUNOLFdBQUssT0FBTyxnQkFBZ0IsR0FBRyxJQUFJO0FBQ25DLHFCQUFRLEtBQUssZ0JBQWdCLGlCQUFpQjtBQUM5QyxXQUFLLEtBQUs7QUFBQSxJQUNaO0FBQUEsSUFFTyx1QkFBNkI7QUFDbEMsV0FBSyxPQUFPLGtCQUFrQixnQkFBZ0Isd0JBQXdCO0FBQ3RFLHFCQUFRLEtBQUssZ0JBQWdCLGlCQUFpQjtBQUM5QyxXQUFLLEtBQUs7QUFBQSxJQUNaO0FBQUEsSUFFTyxxQkFDTCxLQUNBLE9BQ007QUFDTixXQUFLLE9BQU8sUUFBUSxHQUFHLElBQUk7QUFDM0IscUJBQVEsS0FBSyxnQkFBZ0IsU0FBUztBQUN0QyxXQUFLLEtBQUs7QUFBQSxJQUNaO0FBQUEsSUFFTyxjQUNMLEtBQ0EsT0FDTTtBQUNOLFdBQUssT0FBTyxTQUFTLEdBQUcsSUFBSTtBQUM1QixxQkFBUSxLQUFLLGdCQUFnQixVQUFVO0FBQ3ZDLFdBQUssS0FBSztBQUFBLElBQ1o7QUFBQSxJQUVPLGdCQUNMLEtBQ0EsT0FDTTtBQUNOLFdBQUssT0FBTyxHQUFHLEdBQUcsSUFBSTtBQUN0QixxQkFBUSxLQUFLLGdCQUFnQixJQUFJO0FBQ2pDLFdBQUssS0FBSztBQUFBLElBQ1o7QUFBQSxJQUVPLGdCQUNMLEtBQ0EsV0FDTTtBQUNOLFdBQUssT0FBTyxHQUFHLFdBQVcsR0FBRyxJQUFJO0FBQ2pDLHFCQUFRLEtBQUssZ0JBQWdCLElBQUk7QUFDakMsV0FBSyxLQUFLO0FBQUEsSUFDWjtBQUFBLElBRU8sa0JBQXdCO0FBQzdCLFdBQUssT0FBTyxHQUFHLGFBQWEsZ0JBQWdCLG1CQUFtQjtBQUMvRCxxQkFBUSxLQUFLLGdCQUFnQixJQUFJO0FBQ2pDLFdBQUssS0FBSztBQUFBLElBQ1o7QUFBQSxJQUNRLGNBQXFDO0FBQUEsSUFFckMsT0FBYTtBQUNuQixVQUFJLEtBQUssYUFBYTtBQUNwQixxQkFBYSxLQUFLLFdBQVc7QUFBQSxNQUMvQjtBQUNBLFdBQUssY0FBYyxXQUFXLFlBQVk7QUFDeEMsWUFBSTtBQUNGLGdCQUFNLGFBQWEsS0FBSyxVQUFVLEtBQUssTUFBTTtBQUM3QyxnQkFBTSxLQUFLLGdCQUFnQixVQUFVO0FBQ3JDLHVCQUFhO0FBQUEsWUFDWCxHQUFHLG1CQUFtQixHQUFHLEtBQUssY0FBYztBQUFBLFlBQzVDO0FBQUEsVUFDRjtBQUNBLGtCQUFRLElBQUkseUJBQXlCLEtBQUssY0FBYyxFQUFFO0FBQUEsUUFDNUQsU0FBUyxPQUFPO0FBQ2Qsa0JBQVEsTUFBTSx5QkFBeUIsS0FBSyxjQUFjLEtBQUssS0FBSztBQUFBLFFBQ3RFO0FBQ0EsYUFBSyxjQUFjO0FBQUEsTUFDckIsR0FBRyxHQUFHO0FBQUEsSUFDUjtBQUFBLElBRUEsV0FBa0IsV0FBdUI7QUFDdkMsVUFBSSxDQUFDLFlBQVcsV0FBVztBQUN6QixvQkFBVyxZQUFZLElBQUksWUFBVztBQUFBLE1BQ3hDO0FBQ0EsYUFBTyxZQUFXO0FBQUEsSUFDcEI7QUFBQSxJQUVPLFlBQW9CO0FBQ3pCLGFBQU8sS0FBSztBQUFBLElBQ2Q7QUFBQSxJQUVPLElBQTRCLEtBQW1CO0FBQ3BELGFBQU8sS0FBSyxPQUFPLEdBQUc7QUFBQSxJQUN4QjtBQUFBLElBRU8sSUFBNEIsS0FBUSxPQUF3QjtBQUNqRSxXQUFLLE9BQU8sR0FBRyxJQUFJO0FBQUEsSUFDckI7QUFBQSxJQUVPLFFBQWM7QUFDbkIsV0FBSyxTQUFTLFlBQVksSUFBSTtBQUM5QixxQkFBUSxLQUFLLGNBQWM7QUFDM0IsV0FBSyxLQUFLO0FBQUEsSUFDWjtBQUFBLEVBQ0Y7QUFFQSxhQUFXLGFBQWEsV0FBVzs7O0FDeGY1QixNQUFNLHdCQUEyQztBQUFBLElBQ3REO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLEVBQ0Y7QUFHTyxNQUFNLHNCQUF5QztBQUFBLElBQ3BEO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsRUFDRjtBQUdPLE1BQU0seUJBQXlCO0FBRy9CLE1BQU0seUJBQXlCO0FBRS9CLE1BQU0sdUJBQXVCLENBQUMsVUFBMEIsU0FBUyxLQUFLO0FBQ3RFLE1BQU0scUJBQXFCLENBQUMsVUFBMEIsT0FBTyxLQUFLO0FBR2xFLE1BQU0sd0JBQXdCLENBQUMsWUFBNEI7QUFDaEUsUUFBSSxDQUFDLFFBQVMsUUFBTztBQUNyQixVQUFNLFNBQVMsZ0JBQWdCLEtBQUssT0FBTztBQUMzQyxRQUFJLFFBQVE7QUFDVixZQUFNLFFBQVEsT0FBTyxPQUFPLENBQUMsQ0FBQztBQUM5QixhQUFPLHNCQUFzQixLQUFLLEtBQUssVUFBVSxLQUFLO0FBQUEsSUFDeEQ7QUFDQSxVQUFNLE9BQU8sY0FBYyxLQUFLLE9BQU87QUFDdkMsUUFBSSxNQUFNO0FBQ1IsWUFBTSxRQUFRLE9BQU8sS0FBSyxDQUFDLENBQUM7QUFDNUIsYUFBTyxvQkFBb0IsS0FBSyxLQUFLLFFBQVEsS0FBSztBQUFBLElBQ3BEO0FBQ0EsV0FBTztBQUFBLEVBQ1Q7QUFFTyxNQUFNLHFCQUFxQixDQUFDLFlBQW1DO0FBQ3BFLFVBQU0sUUFBUSxnQkFBZ0IsS0FBSyxXQUFXLEVBQUU7QUFDaEQsV0FBTyxRQUFRLE9BQU8sTUFBTSxDQUFDLENBQUMsSUFBSTtBQUFBLEVBQ3BDO0FBRU8sTUFBTSxtQkFBbUIsQ0FBQyxZQUFtQztBQUNsRSxVQUFNLFFBQVEsY0FBYyxLQUFLLFdBQVcsRUFBRTtBQUM5QyxXQUFPLFFBQVEsT0FBTyxNQUFNLENBQUMsQ0FBQyxJQUFJO0FBQUEsRUFDcEM7QUFNTyxNQUFNLGdCQUFnQixDQUFDLE9BQWUsYUFBNkI7QUFDeEUsUUFBSSxDQUFDLE9BQU8sU0FBUyxLQUFLLEVBQUcsUUFBTztBQUNwQyxVQUFNLFFBQVEsS0FBSyxJQUFJLEtBQUssSUFBSSxVQUFVLENBQUMsR0FBRyxJQUFJO0FBQ2xELFVBQU0sWUFBWSxLQUFLLElBQUksS0FBSztBQUNoQyxRQUFJLGFBQWEsTUFBTyxRQUFPO0FBQy9CLFVBQU0sVUFBVSxZQUFZLFVBQVUsSUFBSTtBQUMxQyxXQUFPLEtBQUssS0FBSyxLQUFLLElBQUksS0FBSyxJQUFJLEdBQUcsTUFBTTtBQUFBLEVBQzlDO0FBR08sTUFBTSxxQkFBcUIsQ0FDaEMsR0FDQSxHQUNBLGFBQzZCO0FBQzdCLFVBQU0sUUFBUSxPQUFPLFNBQVMsQ0FBQyxJQUFJLElBQUk7QUFDdkMsVUFBTSxRQUFRLE9BQU8sU0FBUyxDQUFDLElBQUksSUFBSTtBQUN2QyxVQUFNLFlBQVksS0FBSyxNQUFNLE9BQU8sS0FBSztBQUN6QyxRQUFJLGNBQWMsRUFBRyxRQUFPLEVBQUUsR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUN6QyxVQUFNLFNBQVMsY0FBYyxXQUFXLFFBQVE7QUFDaEQsUUFBSSxXQUFXLEVBQUcsUUFBTyxFQUFFLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFDdEMsV0FBTyxFQUFFLEdBQUksUUFBUSxZQUFhLFFBQVEsR0FBSSxRQUFRLFlBQWEsT0FBTztBQUFBLEVBQzVFO0FBWU8sTUFBTSxrQkFBa0IsQ0FDN0IsU0FDQSxVQUNZO0FBQ1osUUFBSSxDQUFDLFdBQVcsVUFBVSxRQUFRLFFBQVEsRUFBRyxRQUFPO0FBQ3BELFVBQU0sU0FBUyxRQUFRLFVBQVUsS0FBSztBQUN0QyxRQUFJLENBQUMsT0FBUSxRQUFPO0FBQ3BCLFFBQUksT0FBTyxRQUFTLFFBQU87QUFDM0IsWUFBUSxPQUFPLFNBQVMsTUFBTTtBQUFBLEVBQ2hDO0FBRU8sTUFBTSxXQUFXLENBQ3RCLFNBQ0EsVUFDVztBQUNYLFFBQUksQ0FBQyxXQUFXLFVBQVUsUUFBUSxRQUFRLEVBQUcsUUFBTztBQUNwRCxVQUFNLFFBQVEsUUFBUSxPQUFPLEtBQUs7QUFDbEMsV0FBTyxPQUFPLFNBQVMsS0FBSyxJQUFLLFFBQW1CO0FBQUEsRUFDdEQ7QUFLTyxNQUFNLGtCQUFrQixDQUM3QixZQUNtQjtBQUNuQixVQUFNLFdBQTJCLENBQUM7QUFDbEMsVUFBTSxVQUFVLFNBQVMsV0FBVyxDQUFDO0FBQ3JDLGFBQVMsUUFBUSxHQUFHLFFBQVEsUUFBUSxRQUFRLFNBQVM7QUFDbkQsZUFBUyxLQUFLLElBQUksZ0JBQWdCLFNBQVMsS0FBSztBQUFBLElBQ2xEO0FBQ0EsV0FBTztBQUFBLEVBQ1Q7QUFHTyxNQUFNLGNBQWMsQ0FDekIsVUFDQSxZQUNhO0FBQ2IsVUFBTSxVQUFvQixDQUFDO0FBQzNCLGVBQVcsQ0FBQyxLQUFLLEtBQUssS0FBSyxPQUFPLFFBQVEsT0FBTyxHQUFHO0FBQ2xELFVBQUksU0FBUyxDQUFDLFNBQVMsT0FBTyxHQUFHLENBQUMsRUFBRyxTQUFRLEtBQUssT0FBTyxHQUFHLENBQUM7QUFBQSxJQUMvRDtBQUNBLFdBQU87QUFBQSxFQUNUO0FBT08sTUFBTSx1QkFBdUIsQ0FDbEMsU0FDQSxVQUEyRCxDQUFDLE1BQzFDO0FBQ2xCLFFBQUksQ0FBQyxRQUFTLFFBQU87QUFDckIsVUFBTSxVQUFVLFFBQVEsV0FBVyxDQUFDO0FBQ3BDLGFBQVMsUUFBUSxHQUFHLFFBQVEsUUFBUSxRQUFRLFNBQVM7QUFDbkQsVUFBSSxnQkFBZ0IsU0FBUyxLQUFLLEVBQUcsUUFBTyxxQkFBcUIsS0FBSztBQUFBLElBQ3hFO0FBQ0EsUUFBSSxRQUFRLFdBQVc7QUFDckIsWUFBTSxZQUFZLFFBQVEsaUJBQWlCO0FBQzNDLFlBQU0sT0FBTyxRQUFRLFFBQVEsQ0FBQztBQUM5QixlQUFTLFFBQVEsR0FBRyxRQUFRLEtBQUssUUFBUSxTQUFTO0FBQ2hELFlBQUksS0FBSyxJQUFJLEtBQUssS0FBSyxLQUFLLENBQUMsS0FBSyxXQUFXO0FBQzNDLGlCQUFPLG1CQUFtQixLQUFLO0FBQUEsUUFDakM7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUNBLFdBQU87QUFBQSxFQUNUO0FBR08sTUFBTSx5QkFBeUI7QUFHL0IsTUFBTSxpQkFBa0Q7QUFBQSxJQUM3RDtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLEVBQ0Y7QUFHTyxNQUFNLHlCQUF5QjtBQW1CL0IsTUFBTSxxQkFBcUIsT0FBc0I7QUFBQSxJQUN0RCxNQUFNLEVBQUUsU0FBUyxHQUFHLFFBQVEsRUFBRTtBQUFBLElBQzlCLE1BQU0sRUFBRSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsSUFDbkIsUUFBUTtBQUFBLElBQ1IsUUFBUTtBQUFBLElBQ1IsTUFBTTtBQUFBLElBQ04sU0FBUyxDQUFDO0FBQUEsSUFDVixTQUFTLENBQUM7QUFBQSxJQUNWLFNBQVMsQ0FBQztBQUFBLEVBQ1o7QUFnQk8sTUFBTSxnQkFBZ0IsQ0FDM0IsU0FDQSxVQUNBLFVBQ0EsaUJBQ0EsVUFDa0I7QUFDbEIsUUFBSSxDQUFDLFFBQVMsUUFBTyxtQkFBbUI7QUFFeEMsVUFBTSxRQUFRO0FBQUEsTUFDWixTQUFTLFNBQVMsaUJBQWlCLFNBQVMsU0FBUyxDQUFDO0FBQUEsTUFDdEQsU0FBUyxTQUFTLGlCQUFpQixTQUFTLFNBQVMsQ0FBQztBQUFBLE1BQ3RELFNBQVM7QUFBQSxJQUNYO0FBQ0EsVUFBTSxRQUFRO0FBQUEsTUFDWixTQUFTLFNBQVMsaUJBQWlCLFNBQVMsU0FBUyxDQUFDO0FBQUEsTUFDdEQsU0FBUztBQUFBLElBQ1g7QUFDQSxVQUFNLFFBQVE7QUFBQSxNQUNaLFNBQVMsU0FBUyxpQkFBaUIsU0FBUyxTQUFTLENBQUM7QUFBQSxNQUN0RCxTQUFTO0FBQUEsSUFDWDtBQUlBLFVBQU0sWUFBWSx5QkFBeUIsU0FBUyxrQkFBa0I7QUFDdEUsVUFBTSxjQUFjLEtBQUssS0FBSyxLQUFLLElBQUksUUFBUSxRQUFRO0FBRXZELFVBQU0sT0FBTyxDQUFDLFdBQ1osZ0JBQWdCLFNBQVMsbUJBQW1CLFNBQVMsTUFBTSxDQUFDLENBQUM7QUFFL0QsVUFBTSxVQUFVLGdCQUFnQixPQUFPO0FBQ3ZDLFVBQU0sVUFBVSxZQUFZLGlCQUFpQixPQUFPO0FBQ3BELFVBQU0sZUFBZSxLQUFLLGdCQUFnQjtBQUUxQyxVQUFNLFVBQWtDLENBQUM7QUFDekMsVUFBTSxVQUFvQixDQUFDO0FBQzNCLGVBQVcsVUFBVSxTQUFTO0FBQzVCLFlBQU0sYUFBYSxlQUFlO0FBQUEsUUFDaEMsQ0FBQyxXQUFXLG1CQUFtQixTQUFTLE1BQU0sQ0FBQyxNQUFNO0FBQUEsTUFDdkQ7QUFDQSxVQUFJLGNBQWMsR0FBRztBQUNuQixnQkFBUTtBQUFBLFVBQ04sZUFBZSxhQUFhLHlCQUF5QjtBQUFBLFFBQ3ZEO0FBQ0E7QUFBQSxNQUNGO0FBQ0EsaUJBQVcsQ0FBQyxRQUFRLE9BQU8sS0FBSyxPQUFPLFFBQVEsUUFBUSxHQUFHO0FBQ3hELFlBQUksbUJBQW1CLE9BQU8sTUFBTSxRQUFRO0FBQzFDLGtCQUFRLEtBQUssTUFBOEI7QUFBQSxRQUM3QztBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBRUEsV0FBTztBQUFBLE1BQ0wsTUFBTTtBQUFBLFFBQ0osU0FBUyxTQUFTLGNBQWMsQ0FBQyxNQUFNLElBQUksTUFBTTtBQUFBLFFBQ2pELFFBQVEsTUFBTTtBQUFBLE1BQ2hCO0FBQUEsTUFDQSxNQUFNO0FBQUEsUUFDSixHQUFHLEtBQUssS0FBSyxLQUFLLElBQUksUUFBUSxRQUFRO0FBQUEsUUFDdEMsR0FBRyxTQUFTLGNBQWMsQ0FBQyxjQUFjO0FBQUEsTUFDM0M7QUFBQSxNQUNBLFFBQVEsS0FBSyxRQUFRO0FBQUEsTUFDckIsUUFBUSxLQUFLLFFBQVE7QUFBQSxNQUNyQixNQUFNLEtBQUssTUFBTTtBQUFBLE1BQ2pCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUdPLE1BQU0sc0JBQXNCLENBQ2pDLFVBQ0EsaUJBQWdDLFNBQ1Q7QUFDdkIsVUFBTSxPQUFPLFlBQVksQ0FBQztBQUMxQixRQUFJLG1CQUFtQixNQUFNO0FBQzNCLFlBQU0sWUFBWSxLQUFLLGNBQWM7QUFDckMsVUFBSSxhQUFhLFVBQVUsY0FBYyxNQUFPLFFBQU87QUFBQSxJQUN6RDtBQUNBLGVBQVcsV0FBVyxNQUFNO0FBQzFCLFVBQUksV0FBVyxRQUFRLGNBQWMsTUFBTyxRQUFPO0FBQUEsSUFDckQ7QUFDQSxXQUFPO0FBQUEsRUFDVDs7O0FDbFVBLE1BQU0sZUFBZSxDQUFDLGVBQTJCO0FBQUEsSUFDL0MsR0FBRztBQUFBLElBQ0gsR0FBRyxXQUFXO0FBQUEsRUFDaEI7QUFFQSxNQUFNLGVBQWUsQ0FBQyxlQUEyQjtBQUFBLElBQy9DLEdBQUc7QUFBQSxJQUNILEdBQUcsV0FBVztBQUFBLEVBQ2hCO0FBR0EsTUFBTSxTQUFTLENBQ2IsUUFDQSxXQUNBLFFBQVEsSUFBSSxPQUNRO0FBQ3BCLFVBQU0sV0FBVyxhQUFhLFNBQVM7QUFDdkMsVUFBTSxXQUFXLGFBQWEsU0FBUztBQUN2QyxRQUFJLFdBQTJCLENBQUM7QUFDaEMsV0FBTyxPQUFPLElBQUksQ0FBQyxVQUFVO0FBQzNCLFlBQU0sU0FBUyxjQUFjLE9BQU8sVUFBVSxVQUFVLFVBQVUsS0FBSztBQUN2RSxpQkFBVyxPQUFPO0FBQ2xCLGFBQU87QUFBQSxJQUNULENBQUM7QUFBQSxFQUNIO0FBRUEsTUFBTSxVQUFVO0FBQUEsSUFDZDtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQSxVQUFVO0FBQUEsTUFDUixVQUFVO0FBQUEsTUFDVixVQUFVO0FBQUEsSUFDWjtBQUFBLElBQ0EsUUFBUSxDQUNOLFNBQ0EsV0FDQSxXQUEyQixDQUFDLEdBQzVCLFFBQVEsSUFBSSxPQUVaO0FBQUEsTUFDRTtBQUFBLE1BQ0EsYUFBYSxTQUFTO0FBQUEsTUFDdEIsYUFBYSxTQUFTO0FBQUEsTUFDdEI7QUFBQSxNQUNBO0FBQUEsSUFDRjtBQUFBLElBQ0Y7QUFBQTtBQUFBLElBRUEsTUFBTSxDQUFDLFdBQXVCLFdBQTJCLENBQUMsR0FBRyxRQUFRLElBQUksT0FDdkU7QUFBQSxNQUNFO0FBQUEsUUFDRSxNQUFNLEtBQUssVUFBVSxjQUFjLEtBQUssQ0FBQyxDQUFDO0FBQUEsTUFDNUM7QUFBQSxNQUNBLGFBQWEsU0FBUztBQUFBLE1BQ3RCLGFBQWEsU0FBUztBQUFBLE1BQ3RCO0FBQUEsTUFDQTtBQUFBLElBQ0Y7QUFBQSxFQUNKO0FBUUEsU0FBTyxpQkFBaUI7QUFFeEIsTUFBTywwQkFBUTsiLAogICJuYW1lcyI6IFsiYWxsIiwgIk1hcCIsICJvbiIsICJ0eXBlIiwgImhhbmRsZXIiLCAiaGFuZGxlcnMiLCAiZ2V0IiwgInB1c2giLCAic2V0IiwgIm9mZiIsICJzcGxpY2UiLCAiaW5kZXhPZiIsICJlbWl0IiwgImV2dCIsICJzbGljZSIsICJtYXAiXQp9Cg==
