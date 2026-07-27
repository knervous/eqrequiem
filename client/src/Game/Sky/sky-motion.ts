export type RequiemSkyMotionSettings = {
  dayLengthSeconds: number;
  celestialRate: number;
  cloudLowRate: number;
  cloudHighRate: number;
  starDriftRate: number;
  starTwinkleRate: number;
};

export const DEFAULT_SKY_MOTION_SETTINGS: Readonly<RequiemSkyMotionSettings> = {
  dayLengthSeconds: 3600,
  celestialRate: 1,
  cloudLowRate: 0.35,
  cloudHighRate: 0.25,
  starDriftRate: 0.4,
  starTwinkleRate: 0.7,
};

const limits: Record<
  keyof RequiemSkyMotionSettings,
  readonly [number, number]
> = {
  dayLengthSeconds: [60, 86400],
  celestialRate: [-8, 8],
  cloudLowRate: [-4, 4],
  cloudHighRate: [-4, 4],
  starDriftRate: [-8, 8],
  starTwinkleRate: [0, 8],
};

export const wrapSkyHour = (hour: number): number =>
  ((hour % 24) + 24) % 24;

export const normalizeSkyMotionSettings = (
  current: RequiemSkyMotionSettings,
  partial: Partial<RequiemSkyMotionSettings>,
): RequiemSkyMotionSettings => {
  const next = { ...current };
  for (const key of Object.keys(partial) as Array<
    keyof RequiemSkyMotionSettings
  >) {
    const candidate = partial[key];
    if (candidate === undefined || !Number.isFinite(candidate)) continue;
    const [minimum, maximum] = limits[key];
    next[key] = Math.max(minimum, Math.min(maximum, candidate));
  }
  return next;
};

export const advanceSkyHour = (
  hour: number,
  deltaMilliseconds: number,
  settings: RequiemSkyMotionSettings,
): number => {
  if (!Number.isFinite(deltaMilliseconds) || deltaMilliseconds <= 0) {
    return wrapSkyHour(hour);
  }
  const hoursPerSecond = 24 / settings.dayLengthSeconds;
  return wrapSkyHour(
    hour +
      hoursPerSecond *
        (deltaMilliseconds / 1000) *
        settings.celestialRate,
  );
};
