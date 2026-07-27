import React, { useState } from 'react';
import GameManager from '@game/Manager/game-manager';
import {
  DEFAULT_SKY_MOTION_SETTINGS,
  type RequiemSkyMotionSettings,
} from '@game/Sky/sky-motion';
import { Button, FormControl, Slider, Typography } from '@mui/material';

type MotionKey = keyof RequiemSkyMotionSettings;

type MotionControl = {
  key: MotionKey;
  label: string;
  minimum: number;
  maximum: number;
  step: number;
  suffix?: string;
};

const controls: MotionControl[] = [
  {
    key: 'dayLengthSeconds',
    label: 'Full day duration',
    minimum: 60,
    maximum: 14400,
    step: 30,
    suffix: ' sec',
  },
  {
    key: 'celestialRate',
    label: 'Sun / moon rate',
    minimum: -4,
    maximum: 4,
    step: 0.01,
    suffix: '×',
  },
  {
    key: 'cloudLowRate',
    label: 'Low cloud rate',
    minimum: -2,
    maximum: 2,
    step: 0.01,
    suffix: '×',
  },
  {
    key: 'cloudHighRate',
    label: 'High cloud rate',
    minimum: -2,
    maximum: 2,
    step: 0.01,
    suffix: '×',
  },
  {
    key: 'starDriftRate',
    label: 'Star drift rate',
    minimum: -4,
    maximum: 4,
    step: 0.01,
    suffix: '×',
  },
  {
    key: 'starTwinkleRate',
    label: 'Star twinkle rate',
    minimum: 0,
    maximum: 4,
    step: 0.01,
    suffix: '×',
  },
];

const skyManager = () =>
  GameManager.instance?.ZoneManager?.SkyManager;

export const DevSky: React.FC = () => {
  const manager = skyManager();
  const [timeOfDay, setTimeOfDayState] = useState(
    manager?.timeOfDay ?? 7,
  );
  const [motion, setMotion] = useState<RequiemSkyMotionSettings>({
    ...DEFAULT_SKY_MOTION_SETTINGS,
    ...manager?.motionSettings,
  });

  const setTimeOfDay = (value: number) => {
    setTimeOfDayState(value);
    skyManager()?.setTimeOfDay(value);
  };

  const setMotionValue = (key: MotionKey, value: number) => {
    const next = skyManager()?.setMotionSettings({ [key]: value });
    setMotion((current) => ({
      ...current,
      ...(next ?? { [key]: value }),
    }));
  };

  const resetMotion = () => {
    const next = skyManager()?.setMotionSettings({
      ...DEFAULT_SKY_MOTION_SETTINGS,
    });
    setMotion({
      ...DEFAULT_SKY_MOTION_SETTINGS,
      ...next,
    });
  };

  return (
    <div style={{ paddingTop: 12 }}>
      <FormControl sx={{ width: '100%', mb: 1.5 }}>
        <Typography sx={{ fontSize: 11 }}>
          Time of day: {timeOfDay.toFixed(2)}
        </Typography>
        <Slider
          size="small"
          value={timeOfDay}
          onChange={(_, value) => setTimeOfDay(Number(value))}
          step={0.01}
          min={0}
          max={24}
        />
      </FormControl>
      {controls.map((control) => (
        <FormControl key={control.key} sx={{ width: '100%', mb: 1 }}>
          <Typography sx={{ fontSize: 11 }}>
            {control.label}: {motion[control.key].toFixed(
              control.key === 'dayLengthSeconds' ? 0 : 2,
            )}
            {control.suffix}
          </Typography>
          <Slider
            size="small"
            value={motion[control.key]}
            onChange={(_, value) =>
              setMotionValue(control.key, Number(value))
            }
            step={control.step}
            min={control.minimum}
            max={control.maximum}
          />
        </FormControl>
      ))}
      <Button size="small" variant="outlined" onClick={resetMotion}>
        Reset gentle defaults
      </Button>
    </div>
  );
};
