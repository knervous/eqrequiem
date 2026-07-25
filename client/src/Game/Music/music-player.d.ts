export declare class MusicPlayer {
    private static audio;
    private static volume;
    private static isPlaying;
    static initialize(): void;
    static play(file: string): void;
    static pause(): void;
    static stop(fadeDuration?: number): Promise<void>;
    static setVolume(volume: number): void;
    static getVolume(): number;
    static getIsPlaying(): boolean;
}
