// File: client/src/Game/Player/webhid-gamepad.ts
import type { GamepadLike } from '@game/Config/gamepad-bindings';
import {
  buildFullModeRequest,
  isNintendoController,
  NINTENDO_HID_FILTERS,
  parseNintendoReport,
  REPORT_ID_OUTPUT,
} from '@game/Config/nintendo-hid';
import emitter from '@game/Events/events';

interface HIDInputReportEventLike extends Event {
  reportId: number;
  data: DataView;
  device: HIDDeviceLike;
}

interface HIDDeviceLike extends EventTarget {
  opened: boolean;
  vendorId: number;
  productId: number;
  productName: string;
  open(): Promise<void>;
  close(): Promise<void>;
  sendReport(reportId: number, data: ArrayBufferView): Promise<void>;
}

interface HIDLike extends EventTarget {
  getDevices(): Promise<HIDDeviceLike[]>;
  requestDevice(options: {
    filters: { vendorId: number; productId?: number }[];
  }): Promise<HIDDeviceLike[]>;
}

const hid = (): HIDLike | null =>
  (navigator as unknown as { hid?: HIDLike }).hid ?? null;

export const isWebHidSupported = (): boolean => Boolean(hid());

/**
 * Reads a Nintendo Switch Pro Controller through WebHID.
 *
 * macOS hands this controller to its own Game Controller framework, so Chrome's
 * Gamepad API never reports it over Bluetooth even though native apps drive it
 * fine. Opening it as a raw HID device sidesteps that entirely. The decoded
 * state is exposed as a `GamepadLike`, so it feeds the same mapping pipeline as
 * any ordinary pad.
 */
export class WebHidGamepad {
  private device: HIDDeviceLike | null = null;
  private state: GamepadLike | null = null;
  private packetCounter = 0;
  private lastReportAt = 0;

  private readonly onInputReport = (event: Event) => {
    const report = event as HIDInputReportEventLike;
    const parsed = parseNintendoReport(report.reportId, report.data);
    if (!parsed) return;
    this.state = parsed;
    this.lastReportAt = performance.now();
  };

  private readonly onDisconnect = (event: Event) => {
    const disconnected = (event as unknown as { device?: HIDDeviceLike }).device;
    if (disconnected && disconnected !== this.device) return;
    this.detach();
    emitter.emit('gamepadConnected', null);
  };

  constructor() {
    hid()?.addEventListener('disconnect', this.onDisconnect);
  }

  /** The most recent decoded state, or null when no device is attached. */
  public get current(): GamepadLike | null {
    return this.state;
  }

  public get connected(): boolean {
    return Boolean(this.device?.opened);
  }

  public get deviceName(): string | null {
    return this.device?.productName ?? null;
  }

  /** True when a device is open but has not reported recently. */
  public get idle(): boolean {
    return this.connected && performance.now() - this.lastReportAt > 2000;
  }

  /**
   * Re-opens a controller the user has already granted access to. Safe to call
   * on startup — it never shows a prompt.
   */
  public async restore(): Promise<boolean> {
    const api = hid();
    if (!api) return false;
    try {
      const devices = await api.getDevices();
      const match = devices.find(isNintendoController);
      if (!match) return false;
      return this.attach(match);
    } catch (error) {
      console.warn('[WebHidGamepad] Failed to restore device:', error);
      return false;
    }
  }

  /**
   * Shows the browser's device picker. Must be called from a user gesture, so
   * this is wired to a button in the options window rather than run on load.
   */
  public async requestDevice(): Promise<boolean> {
    const api = hid();
    if (!api) return false;
    try {
      const devices = await api.requestDevice({
        filters: NINTENDO_HID_FILTERS,
      });
      const match = devices.find(isNintendoController) ?? devices[0];
      if (!match) return false;
      return this.attach(match);
    } catch (error) {
      // The picker throws when the user dismisses it; that is not an error.
      console.info('[WebHidGamepad] Device selection cancelled:', error);
      return false;
    }
  }

  private async attach(device: HIDDeviceLike): Promise<boolean> {
    try {
      if (!device.opened) await device.open();
    } catch (error) {
      console.warn('[WebHidGamepad] Failed to open device:', error);
      return false;
    }

    this.detachListeners();
    this.device = device;
    device.addEventListener('inputreport', this.onInputReport);

    // Ask for the high-resolution report. The controller still streams the
    // simple report if this is refused, which we also decode, so a failure
    // here costs stick precision rather than all input.
    try {
      await device.sendReport(
        REPORT_ID_OUTPUT,
        buildFullModeRequest(this.packetCounter++),
      );
    } catch (error) {
      console.info(
        '[WebHidGamepad] Full input mode refused, using simple reports:',
        error,
      );
    }

    emitter.emit('gamepadConnected', device.productName || 'Pro Controller');
    return true;
  }

  private detachListeners() {
    this.device?.removeEventListener('inputreport', this.onInputReport);
  }

  private detach() {
    this.detachListeners();
    this.device = null;
    this.state = null;
  }

  public async dispose() {
    hid()?.removeEventListener('disconnect', this.onDisconnect);
    const device = this.device;
    this.detach();
    try {
      if (device?.opened) await device.close();
    } catch {
      // Closing a device that is already gone is not worth reporting.
    }
  }
}

let instance: WebHidGamepad | null = null;

/**
 * Shared instance. The options window drives the pairing prompt and the player
 * reads the resulting state, so both sides must see the same open device.
 */
export const getWebHidGamepad = (): WebHidGamepad => {
  if (!instance) instance = new WebHidGamepad();
  return instance;
};
