const baseUrl = "https://eqrequiem.blob.core.windows.net/assets/music";


export class MusicPlayer {
  private static audio: HTMLAudioElement | null = null;
  private static volume: number = 1.0; // Volume range: 0.0 to 1.0
  private static isPlaying: boolean = false;

  // Initialize the audio element
  public static initialize(): void {
    if (!MusicPlayer.audio) {
      MusicPlayer.audio = new Audio();
      MusicPlayer.audio.crossOrigin = 'anonymous'; // Set CORS for src
      MusicPlayer.audio.volume = MusicPlayer.volume;
      MusicPlayer.audio.addEventListener('ended', () => {
        MusicPlayer.isPlaying = false;
      });
    }
  }

  // Play music from an MP3 URL
  public static play(file: string): void {
    console.log('%c Playing music file:', 'color: green', file);
    MusicPlayer.initialize();
    if (MusicPlayer.audio) {
      MusicPlayer.audio.src = `${baseUrl}/${file}.mp3`;
      MusicPlayer.audio.play().then(() => {
        MusicPlayer.isPlaying = true;
      }).catch((error) => {
        console.log('%c Playback failed for music file:', 'color: red', file);
        console.error('Playback failed:', error);
      });
    } else {
      console.error('Audio element is not initialized.');
    }
  }

  // Pause the current track
  public static pause(): void {
    if (MusicPlayer.audio && MusicPlayer.isPlaying) {
      MusicPlayer.audio.pause();
      MusicPlayer.isPlaying = false;
    }
  }

  // Stop playback with fade-out effect
  public static async stop(fadeDuration: number = 1000): Promise<void> {
    if (MusicPlayer.audio && MusicPlayer.isPlaying) {
      const steps = 10;
      const stepTime = fadeDuration / steps;
      const volumeStep = MusicPlayer.volume / steps;

      for (let i = 0; i < steps; i++) {
        MusicPlayer.audio.volume = Math.max(0, MusicPlayer.volume - volumeStep * (i + 1));
        await new Promise((resolve) => setTimeout(resolve, stepTime));
      }

      MusicPlayer.audio.pause();
      MusicPlayer.audio.currentTime = 0;
      MusicPlayer.audio.volume = MusicPlayer.volume; // Reset volume
      MusicPlayer.isPlaying = false;
    }
  }

  // Set volume (0.0 to 1.0)
  public static setVolume(volume: number): void {
    if (volume < 0.0 || volume > 1.0) {
      throw new Error('Volume must be between 0.0 and 1.0');
    }
    MusicPlayer.volume = volume;
    if (MusicPlayer.audio) {
      MusicPlayer.audio.volume = volume;
    }
  }

  // Get current volume
  public static getVolume(): number {
    return MusicPlayer.volume;
  }

  // Check if music is playing
  public static getIsPlaying(): boolean {
    return MusicPlayer.isPlaying;
  }
}
window.musicPlayer = MusicPlayer;