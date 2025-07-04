import React, { useCallback, useEffect, useState } from 'react';
import Player from '@game/Player/player';
import {
  Box,
  Stack,
  Checkbox,
  FormControlLabel,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Typography,
  Slider,
} from '@mui/material';
import emitter from '@game/Events/events';
import { useEvent } from '@game/Events/event-hooks';

const speedKey = 'dev-player-speed';

export const DevPlayer: React.FC = () => {
  const player = Player.instance!;

  const [speed, setSpeed] = useState(player?.playerMovement?.moveSpeed ?? 20);
  const [anim, setAnim] = useState(player?.currentAnimation || '');
  const [collision, setCollision] = useState(true);
  const [gravity, setGravity] = useState(true);
  const onSpeed = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = +e.target.value;
    setSpeed(v);
    if (player?.playerMovement) {
      localStorage.setItem(speedKey, v.toString());

      player.playerMovement.moveSpeed = v;
    } 
  };

  const restoreSpeed = useCallback(() => {
    const player = Player.instance;
    if (!player?.playerMovement) return;
    const savedSpeed = localStorage.getItem(speedKey);

    if (savedSpeed) {
      setSpeed(+savedSpeed);
      player.playerMovement.moveSpeed = +savedSpeed;
    }
  }, []);
  useEvent('playerLoaded', restoreSpeed);


  const onAnim = (e: React.ChangeEvent<{ value: unknown }>) => {
    setAnim(e.target.value as string);
  };

  const toggleCollision = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setCollision(checked);
    player.setCollision(checked);
  };

  const toggleGravity = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setGravity(checked);
    player.setGravity(checked);
  };

  return (
    <Box p={0} sx={{ '*': { color: 'white!important' } }}>
      <Stack spacing={2}>
        <FormControl sx={{ width: "calc(100% - 20px)", color: "white" }}>
          <Typography
            sx={{ fontSize: 12, marginTop: 1, width: "80%" }}
            color="text.secondary"
            gutterBottom
          >
              Move Speed: {speed}
          </Typography>
          <Slider
            sx={{ width: '100%' }}
            size='small'
            value={speed}
            onChange={onSpeed}
            step={1}
            min={1}
            max={300}
          />
        </FormControl>
        
        <Stack direction="row" spacing={1}>
          <FormControlLabel
            control={<Checkbox size="small" checked={collision} onChange={toggleCollision}/>} 
            label="Collision"
          />
          <FormControlLabel
            control={<Checkbox size="small" checked={gravity} onChange={toggleGravity}/>} 
            label="Gravity"
          />
        </Stack>

        <Stack direction="row" spacing={1} alignItems="center">
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Animation</InputLabel>
            <Select value={anim} label="Animation" onChange={onAnim}>
              {Object.keys(player?.animations ?? {}).map((a) => (
                <MenuItem key={a} value={a}>{a}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button size="small" variant="contained" onClick={() => player.playAnimation(anim, 0, true)}>
            Play
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
};