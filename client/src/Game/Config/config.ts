// File: client/src/Game/Config/config.ts
import emitter from '@game/Events/events';
import {
  ActionButtonData,
  ActionButtonType,
  ActionType,
} from '@ui/components/game/action-button/constants';
import { getEQFile, writeRootEQFile } from 'sage-core/util/fileHandler';
import { Config, KeyBindings, Settings } from './types';

const configVersion = 5;

export const DEFAULT_CONFIG: Config = {
  keyBindings: {
    moveForward   : 'W',
    moveBackward  : 'S',
    turnLeft      : 'A',
    turnRight     : 'D',
    hail          : 'H',
    consider      : 'C',
    jump          : 'Space',
    sitStand      : 'Ctrl+S',
    targetNearest : 'Tab',
    targetPrevious: 'Shift+Tab',
    inventory     : 'I',
    spells        : 'P',
    autoAttack    : 'T',

    // Chat
    reply  : 'R',
    // Misc
    autoRun: 'Clear',

    // Hotkeys
    hotkey1 : '1',
    hotkey2 : '2',
    hotkey3 : '3',
    hotkey4 : '4',
    hotkey5 : '5',
    hotkey6 : '6',
    hotkey7 : '7',
    hotkey8 : '8',
    hotkey9 : '9',
    hotkey10: '0',
  },
  settings: {
    particles: true,
    sound    : true,
    music    : true,
  },
  ui: {
    theme       : 'default',
    fontSize    : 14,
    showTooltips: true,
  },
  hotButtons: {
    0: {
      type  : ActionButtonType.MELEE_ATTACK,
      action: ActionType.MELEE_ATTACK,
      label : 'Melee Attack',
      index : 0,
    },
    '1': {
      type  : ActionButtonType.SOCIALS,
      action: ActionType.SOCIAL,
      label : 'Hail',
      color : '#00FF00',
      data  : ['/hail'],
      index : 0,
    },
    '2': {
      type: 12,
    },
    '3': {
      type  : ActionButtonType.SOCIALS,
      action: ActionType.SOCIAL,
      label : 'Consider',
      color : '#FFFF00',
      data  : ['/consider'],
      index : 1,
    },
    '4': {
      type: 8,
    },
    '5': {
      type: 13,
    },
    '9': {
      type: 11,
    },
  },
  combatButtons: {
    0: {
      type  : ActionButtonType.MELEE_ATTACK,
      action: ActionType.MELEE_ATTACK,
      label : 'Melee Attack',
    },
    1: {
      type  : ActionButtonType.RANGED_ATTACK,
      action: ActionType.RANGED_ATTACK,
      label : 'Ranged Attack',
    },
  },
  socialButtons: {
    0: {
      type  : ActionButtonType.SOCIALS,
      action: ActionType.SOCIAL,
      label : 'Hail',
      color : '#00FF00',
      data  : ['/hail'],
    },
    1: {
      type  : ActionButtonType.SOCIALS,
      action: ActionType.SOCIAL,
      label : 'Consider',
      color : '#FFFF00',
      data  : ['/consider'],
    },
    2: {
      type  : ActionButtonType.SOCIALS,
      action: ActionType.SOCIAL,
      label : 'Afk',
      color : '#FF00FF',
      data  : ['/afk'],
    },
  },
  abilityButtons: {},
};

export class UserConfig {
  private static instance_: UserConfig;
  private config: Config;
  private configFilePath = '';

  private constructor() {
    this.config = DEFAULT_CONFIG;
    emitter.on('updateConfig', this.updateConfigEvent.bind(this));
  }

  private updateConfigEvent(key?: keyof Config): void {
    switch (key) {
      case 'keyBindings':
        emitter.emit('updateKeybinds');
        break;
      case 'settings':
        emitter.emit('updateSettings');
        break;
      case 'hotButtons':
        emitter.emit('updateHotButtons');
        break;
      case 'combatButtons':
        emitter.emit('updateCombatButtons');
        break;
      case 'socialButtons':
        emitter.emit('updateSocialButtons');
        break;
      case 'abilityButtons':
        emitter.emit('updateAbilityButtons');
        break;
      default:
        emitter.emit('updateSettings');
        emitter.emit('updateKeybinds');
        emitter.emit('updateHotButtons');
        emitter.emit('updateCombatButtons');
        emitter.emit('updateSocialButtons');
        emitter.emit('updateAbilityButtons');
    }
  }

  public async initialize(server: string, player: string): Promise<void> {
    this.configFilePath = `${server}_${player}_${configVersion}.json`;
    const configData = (await getEQFile(
      'config',
      this.configFilePath,
      'json',
    )) as Partial<Config> | null;
    console.log('Config data', configData);
    this.config =
      !configData || Object.keys(configData).length === 0
        ? DEFAULT_CONFIG
        : { ...DEFAULT_CONFIG, ...configData };
    emitter.emit('updateConfig');
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
    emitter.emit('updateConfig', 'hotButtons');
    this.save();
  }

  public updateHotButton(index: number, actionButton: ActionButtonData | null) {
    if (actionButton) {
      this.config.hotButtons[index] = actionButton;
    } else {
      delete this.config.hotButtons[index];
    }
    emitter.emit('updateConfig', 'hotButtons');
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
    emitter.emit('updateConfig', 'combatButtons');
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
    emitter.emit('updateConfig', 'socialButtons');
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
    emitter.emit('updateConfig', 'abilityButtons');
    this.save();
  }

  public updateKeybind(key: keyof KeyBindings, value: string): void {
    this.config.keyBindings[key] = value;
    emitter.emit('updateConfig', 'keyBindings');
    this.save();
  }

  public updateSetting<K extends keyof Settings>(
    key: K,
    value: Settings[K],
  ): void {
    this.config.settings[key] = value;
    emitter.emit('updateConfig', 'settings');
    this.save();
  }
  private saveTimeout: NodeJS.Timeout | null = null;

  private save(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(async () => {
      await writeRootEQFile(
        'eqrequiem/config',
        this.configFilePath,
        JSON.stringify(this.config, null, 2),
      );
      console.log(`Config saved to ${this.configFilePath}`);
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
    this.config = DEFAULT_CONFIG;
    emitter.emit('updateConfig');
  }
}

globalThis.UserConfig = UserConfig.instance;
