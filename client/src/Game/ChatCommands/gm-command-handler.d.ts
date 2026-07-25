import { BaseCommandHandler } from './command-base';
export declare class GMCommandHandler extends BaseCommandHandler {
    commandHelp(): void;
    commandZone(args: string[]): void;
    commandLevel(args: string[]): void;
    commandSearchItem(args: string[]): void;
    commandSummonItem(args: string[]): void;
    commandPurgeItems(): void;
    commandGearUp(): void;
}
