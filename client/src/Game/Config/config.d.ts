import { ActionButtonData } from '@ui/components/game/action-button/constants';
import { Config, KeyBindings, Settings } from './types';
export declare const DEFAULT_CONFIG: Config;
export declare class UserConfig {
    private static instance_;
    private config;
    private configFilePath;
    private constructor();
    private updateConfigEvent;
    initialize(server: string, player: string): Promise<void>;
    swapHotButtons(index1: number, index2?: number): void;
    updateHotButton(index: number, actionButton: ActionButtonData | null): void;
    updateCombatButton(index: number, actionButton: ActionButtonData | null): void;
    updateSocialButton(index: number, actionButton: ActionButtonData | null): void;
    updateAbilityButton(index: number, actionButton: ActionButtonData | null): void;
    updateKeybind(key: keyof KeyBindings, value: string): void;
    updateSetting<K extends keyof Settings>(key: K, value: Settings[K]): void;
    private saveTimeout;
    private save;
    static get instance(): UserConfig;
    getConfig(): Config;
    get<K extends keyof Config>(key: K): Config[K];
    set<K extends keyof Config>(key: K, value: Config[K]): void;
    reset(): void;
}
