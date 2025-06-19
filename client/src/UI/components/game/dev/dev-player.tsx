import React, { useEffect, useState } from 'react';
import Player from '@game/Player/player';
import {
  Box,
  Stack,
  TextField,
  Checkbox,
  FormControlLabel,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
} from '@mui/material';

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

      player.playerMovement.moveSpeed = v;
    } 
  };

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
    <Box p={2} sx={{ '*': { color: 'white!important' } }}>
      <Stack spacing={2}>
        <TextField
          label="Move Speed"
          type="number"
          size="small"
          value={speed}
          onChange={onSpeed}
          InputProps={{ inputProps: { min: 0, step: 1 } }}
          sx={{ width: 200 }}
        />

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