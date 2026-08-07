// File: client/e2e/e2e.d.ts
// Loose declarations for the harness globals the specs drive.
declare global {
  interface Window {
    gamepadHarness: any;
    controlsHarness: {
      config: () => any;
      reset: () => void;
    };
    __virtualGamepad: {
      connected: boolean;
      axes: number[];
      buttons: number[];
      id: string;
    };
  }
}

export {};
