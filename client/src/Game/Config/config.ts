
// File: client/src/Game/Config/config.ts
import emitter from '@game/Events/events';
import {
  ActionButtonData,
  ActionButtonType,
  ActionType,
} from '@ui/components/game/action-button/constants';
import { getEQFile, writeRootEQFile } from 'sage-core/util/fileHandler';
import { Config, KeyBindings, Settings } from './types';

const configVersion = 4;

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
      type : ActionButtonType.COMBAT,
      index: 0,
    },
    1: {
      type : ActionButtonType.SOCIALS,
      index: 0,
    },
    2: {
      type: ActionButtonType.SIT,
    },
    3: {
      type: ActionButtonType.WALK,
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
      type : ActionButtonType.SOCIALS,
      label: 'Hail',
      color: '#00FF00',
      data : ['/hail'],
    },
    1: {
      type : ActionButtonType.SOCIALS,
      label: 'Consider',
      color: '#FFFF00',
      data : ['/consider'],
    },
    2: {
      type : ActionButtonType.SOCIALS,
      label: 'Afk',
      color: '#FF00FF',
      data : ['/afk'],
    },
  },
  abilityButtons: {},
};


export class UserConfig {
  private static instance_: UserConfig;
  private config: Config;
  private configFilePath = '';
  private writePromise: Promise<void> | null = null;

  private constructor() {
    this.config = DEFAULT_CONFIG;
    emitter.on('updateConfig', this.updateConfigEvent.bind(this));
  }

  private updateConfigEvent() {
    emitter.emit('updateSettings');
    emitter.emit('updateKeybinds');
    emitter.emit('updateHotButtons');
    emitter.emit('updateCombatButtons');
    emitter.emit('updateSocialButtons');
    emitter.emit('updateAbilityButtons');
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

  public swapHotButtons(
    index1: number,
    index2: number = index1 + 1,
  ): void {
    const temp = this.config.hotButtons[index1];
    this.config.hotButtons[index1] = this.config.hotButtons[index2];
    if (temp !== undefined) {
      this.config.hotButtons[index2] = temp;
    } else {
      delete this.config.hotButtons[index2];
    }
    emitter.emit('updateHotButtons');
    this.save();
  }

  public updateHotButton(index: number, actionButton: ActionButtonData | null) {
    if (actionButton) {
      this.config.hotButtons[index] = actionButton;
    } else {
      delete this.config.hotButtons[index];
    }
    emitter.emit('updateHotButtons');
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
    emitter.emit('updateCombatButtons');
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
    emitter.emit('updateSocialButtons');
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
    emitter.emit('updateAbilityButtons');
    this.save();
  }

  public updateKeybind(key: keyof KeyBindings, value: string): void {
    this.config.keyBindings[key] = value;
    emitter.emit('updateKeybinds');
    this.save();
  }

  public updateSetting<K extends keyof Settings>(
    key: K,
    value: Settings[K],
  ): void {
    this.config.settings[key] = value;
    emitter.emit('updateSettings');
    this.save();
  }

  private async save(): Promise<void> {
    if (this.writePromise) {
      await this.writePromise;
    }
    this.writePromise = writeRootEQFile(
      'eqrequiem/config',
      this.configFilePath,
      JSON.stringify(this.config, null, 2),
    );
    await this.writePromise;
    this.writePromise = null;
    console.log(`Config saved to ${this.configFilePath}`);
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
