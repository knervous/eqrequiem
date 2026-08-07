// File: client/src/Game/Config/nintendo-hid.ts
//
// Nintendo Switch Pro Controller support over WebHID.
//
// macOS claims this controller through the Game Controller framework, which
// is why it drives native games happily while Chrome's Gamepad API never
// enumerates it over Bluetooth. WebHID lets us open the device directly and
// decode its input reports ourselves.
//
// Everything here is pure: reports in, a standard-mapping `GamepadLike` out,
// so the rest of the controller pipeline is unchanged and the decoding can be
// tested without the hardware present.
import type { GamepadLike, MotionSample } from './gamepad-bindings';

export const NINTENDO_VENDOR_ID = 0x057e;

/** Product ids we know how to decode. */
export const SWITCH_PRO_PRODUCT_ID = 0x2009;
export const SWITCH_CHARGING_GRIP_PRODUCT_ID = 0x200e;

export const NINTENDO_HID_FILTERS = [
  { vendorId: NINTENDO_VENDOR_ID, productId: SWITCH_PRO_PRODUCT_ID },
  { vendorId: NINTENDO_VENDOR_ID, productId: SWITCH_CHARGING_GRIP_PRODUCT_ID },
];

/** Simple (uninitialised) Bluetooth input report. */
export const REPORT_ID_SIMPLE = 0x3f;
/** Full input report, sent once the controller is switched into full mode. */
export const REPORT_ID_FULL = 0x30;

/** Output report used to carry subcommands to the controller. */
export const REPORT_ID_OUTPUT = 0x01;
/** Subcommand: set input report mode. */
export const SUBCOMMAND_SET_INPUT_MODE = 0x03;
/** Argument to `SUBCOMMAND_SET_INPUT_MODE` selecting the full report. */
export const INPUT_MODE_FULL = 0x30;
/** Subcommand: enable or disable the six-axis motion sensor. */
export const SUBCOMMAND_ENABLE_IMU = 0x40;

/** Offset of the IMU block within the full report, excluding the report id. */
export const IMU_OFFSET = 12;
/** The full report carries three IMU frames, 5ms apart. */
export const IMU_FRAME_COUNT = 3;
export const IMU_FRAME_BYTES = 12;

/**
 * Raw-to-physical scale factors for the default sensor ranges: +/-8g for the
 * accelerometer and +/-2000 degrees per second for the gyroscope.
 */
export const ACCEL_SCALE_G = 0.000244;
export const GYRO_SCALE_DPS = 0.06103;

const STANDARD_BUTTON_COUNT = 17;

/**
 * Standard-mapping button indices, so the game's default bindings land on the
 * same physical positions they would on any other pad. Note that Nintendo's
 * face labels are mirrored against Xbox's: the controller's B sits where an
 * Xbox A does, and the API is positional, so button 0 is the bottom face
 * button regardless of what is printed on it.
 */
export const STANDARD = {
  faceBottom: 0,
  faceRight: 1,
  faceLeft: 2,
  faceTop: 3,
  leftBumper: 4,
  rightBumper: 5,
  leftTrigger: 6,
  rightTrigger: 7,
  minus: 8,
  plus: 9,
  leftStick: 10,
  rightStick: 11,
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
  home: 16,
} as const;

const emptyButtons = () =>
  Array.from({ length: STANDARD_BUTTON_COUNT }, () => ({
    pressed: false,
    value: 0,
  }));

const setButton = (
  buttons: { pressed: boolean; value: number }[],
  index: number,
  pressed: boolean,
) => {
  if (pressed) {
    buttons[index] = { pressed: true, value: 1 };
  }
};

/** 12-bit stick reading to -1..1, with up on the stick reading negative. */
const normalizeStick = (raw: number, center: number, range: number) => {
  const value = (raw - center) / range;
  return Math.max(-1, Math.min(1, value));
};

/** The neutral point of a 12-bit axis before per-device calibration. */
const CENTER_12BIT = 2048;
const RANGE_12BIT = 1900;

/** The neutral point of the 16-bit axes in the simple report. */
const CENTER_16BIT = 32768;
const RANGE_16BIT = 32768;

const DPAD_DIRECTIONS: Record<number, number[]> = {
  0: [STANDARD.dpadUp],
  1: [STANDARD.dpadUp, STANDARD.dpadRight],
  2: [STANDARD.dpadRight],
  3: [STANDARD.dpadRight, STANDARD.dpadDown],
  4: [STANDARD.dpadDown],
  5: [STANDARD.dpadDown, STANDARD.dpadLeft],
  6: [STANDARD.dpadLeft],
  7: [STANDARD.dpadLeft, STANDARD.dpadUp],
};

const readByte = (data: DataView, offset: number): number =>
  offset < data.byteLength ? data.getUint8(offset) : 0;

const readInt16 = (data: DataView, offset: number): number =>
  offset + 1 < data.byteLength ? data.getInt16(offset, true) : 0;

/**
 * Averages the three IMU frames the full report carries. Each frame holds a
 * three-axis accelerometer reading followed by a three-axis gyroscope
 * reading, all as signed 16-bit little-endian values.
 *
 * Returns null when the report is too short, which is what a controller that
 * has not had its motion sensor enabled sends.
 */
export const parseMotion = (data: DataView): MotionSample | null => {
  const required = IMU_OFFSET + IMU_FRAME_COUNT * IMU_FRAME_BYTES;
  if (data.byteLength < required) return null;

  let accelX = 0, accelY = 0, accelZ = 0;
  let gyroX = 0, gyroY = 0, gyroZ = 0;

  for (let frame = 0; frame < IMU_FRAME_COUNT; frame++) {
    const base = IMU_OFFSET + frame * IMU_FRAME_BYTES;
    accelX += readInt16(data, base);
    accelY += readInt16(data, base + 2);
    accelZ += readInt16(data, base + 4);
    gyroX += readInt16(data, base + 6);
    gyroY += readInt16(data, base + 8);
    gyroZ += readInt16(data, base + 10);
  }

  const accelAverage = ACCEL_SCALE_G / IMU_FRAME_COUNT;
  const gyroAverage = GYRO_SCALE_DPS / IMU_FRAME_COUNT;

  return {
    accelX: accelX * accelAverage,
    accelY: accelY * accelAverage,
    accelZ: accelZ * accelAverage,
    gyroX: gyroX * gyroAverage,
    gyroY: gyroY * gyroAverage,
    gyroZ: gyroZ * gyroAverage,
  };
};

/**
 * Decodes the simple report the controller emits over Bluetooth before it has
 * been switched into full mode. Sticks here are coarse, but it means a pad
 * works the moment it is opened, even if the mode change is rejected.
 *
 * `data` excludes the report id, matching WebHID's `inputreport` event.
 */
export const parseSimpleReport = (data: DataView): GamepadLike => {
  const buttons = emptyButtons();
  const first = readByte(data, 0);
  const second = readByte(data, 1);

  setButton(buttons, STANDARD.faceBottom, Boolean(first & 0x01)); // B
  setButton(buttons, STANDARD.faceRight, Boolean(first & 0x02)); // A
  setButton(buttons, STANDARD.faceLeft, Boolean(first & 0x04)); // Y
  setButton(buttons, STANDARD.faceTop, Boolean(first & 0x08)); // X
  setButton(buttons, STANDARD.leftBumper, Boolean(first & 0x10));
  setButton(buttons, STANDARD.rightBumper, Boolean(first & 0x20));
  setButton(buttons, STANDARD.leftTrigger, Boolean(first & 0x40));
  setButton(buttons, STANDARD.rightTrigger, Boolean(first & 0x80));

  setButton(buttons, STANDARD.minus, Boolean(second & 0x01));
  setButton(buttons, STANDARD.plus, Boolean(second & 0x02));
  setButton(buttons, STANDARD.leftStick, Boolean(second & 0x04));
  setButton(buttons, STANDARD.rightStick, Boolean(second & 0x08));
  setButton(buttons, STANDARD.home, Boolean(second & 0x10));

  for (const index of DPAD_DIRECTIONS[readByte(data, 2)] ?? []) {
    setButton(buttons, index, true);
  }

  const axisAt = (offset: number) =>
    readByte(data, offset) | (readByte(data, offset + 1) << 8);

  return {
    id: 'Pro Controller (WebHID)',
    connected: true,
    mapping: 'standard',
    index: 0,
    axes: [
      normalizeStick(axisAt(3), CENTER_16BIT, RANGE_16BIT),
      normalizeStick(axisAt(5), CENTER_16BIT, RANGE_16BIT),
      normalizeStick(axisAt(7), CENTER_16BIT, RANGE_16BIT),
      normalizeStick(axisAt(9), CENTER_16BIT, RANGE_16BIT),
    ],
    buttons,
  };
};

/**
 * Decodes the full input report, which carries proper 12-bit analog sticks.
 *
 * `data` excludes the report id, matching WebHID's `inputreport` event.
 */
export const parseFullReport = (data: DataView): GamepadLike => {
  const buttons = emptyButtons();
  const right = readByte(data, 2);
  const shared = readByte(data, 3);
  const left = readByte(data, 4);

  setButton(buttons, STANDARD.faceTop, Boolean(right & 0x02)); // X
  setButton(buttons, STANDARD.faceLeft, Boolean(right & 0x01)); // Y
  setButton(buttons, STANDARD.faceBottom, Boolean(right & 0x04)); // B
  setButton(buttons, STANDARD.faceRight, Boolean(right & 0x08)); // A
  setButton(buttons, STANDARD.rightBumper, Boolean(right & 0x40));
  setButton(buttons, STANDARD.rightTrigger, Boolean(right & 0x80));

  setButton(buttons, STANDARD.minus, Boolean(shared & 0x01));
  setButton(buttons, STANDARD.plus, Boolean(shared & 0x02));
  setButton(buttons, STANDARD.rightStick, Boolean(shared & 0x04));
  setButton(buttons, STANDARD.leftStick, Boolean(shared & 0x08));
  setButton(buttons, STANDARD.home, Boolean(shared & 0x10));

  setButton(buttons, STANDARD.dpadDown, Boolean(left & 0x01));
  setButton(buttons, STANDARD.dpadUp, Boolean(left & 0x02));
  setButton(buttons, STANDARD.dpadRight, Boolean(left & 0x04));
  setButton(buttons, STANDARD.dpadLeft, Boolean(left & 0x08));
  setButton(buttons, STANDARD.leftBumper, Boolean(left & 0x40));
  setButton(buttons, STANDARD.leftTrigger, Boolean(left & 0x80));

  // Each stick packs a 12-bit x and a 12-bit y across three bytes.
  const stickAt = (offset: number) => {
    const a = readByte(data, offset);
    const b = readByte(data, offset + 1);
    const c = readByte(data, offset + 2);
    return {
      x: a | ((b & 0x0f) << 8),
      y: (b >> 4) | (c << 4),
    };
  };

  const leftStick = stickAt(5);
  const rightStick = stickAt(8);
  const motion = parseMotion(data);

  return {
    id: 'Pro Controller (WebHID)',
    connected: true,
    mapping: 'standard',
    index: 0,
    axes: [
      normalizeStick(leftStick.x, CENTER_12BIT, RANGE_12BIT),
      -normalizeStick(leftStick.y, CENTER_12BIT, RANGE_12BIT),
      normalizeStick(rightStick.x, CENTER_12BIT, RANGE_12BIT),
      -normalizeStick(rightStick.y, CENTER_12BIT, RANGE_12BIT),
    ],
    buttons,
    ...(motion ? { motion } : {}),
  };
};

/** Routes a report to the matching decoder, or null if we don't know it. */
export const parseNintendoReport = (
  reportId: number,
  data: DataView,
): GamepadLike | null => {
  if (reportId === REPORT_ID_FULL) return parseFullReport(data);
  if (reportId === REPORT_ID_SIMPLE) return parseSimpleReport(data);
  return null;
};

/**
 * Builds the output report that switches the controller into full mode.
 * Layout is a rolling packet counter, eight bytes of neutral rumble, then the
 * subcommand and its argument.
 */
export const buildSubcommand = (
  packetCounter: number,
  subcommand: number,
  argument: number,
): Uint8Array => {
  const neutralRumble = [0x00, 0x01, 0x40, 0x40, 0x00, 0x01, 0x40, 0x40];
  return new Uint8Array([
    packetCounter & 0x0f,
    ...neutralRumble,
    subcommand,
    argument,
  ]);
};

export const buildFullModeRequest = (packetCounter: number): Uint8Array =>
  buildSubcommand(packetCounter, SUBCOMMAND_SET_INPUT_MODE, INPUT_MODE_FULL);

/** Turns the six-axis motion sensor on or off. */
export const buildImuRequest = (
  packetCounter: number,
  enabled: boolean,
): Uint8Array =>
  buildSubcommand(packetCounter, SUBCOMMAND_ENABLE_IMU, enabled ? 0x01 : 0x00);

export const isNintendoController = (device: {
  vendorId?: number;
  productId?: number;
}): boolean =>
  device.vendorId === NINTENDO_VENDOR_ID &&
  (device.productId === SWITCH_PRO_PRODUCT_ID ||
    device.productId === SWITCH_CHARGING_GRIP_PRODUCT_ID);
