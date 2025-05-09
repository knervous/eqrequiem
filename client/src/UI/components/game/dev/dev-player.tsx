import Player from '@game/Player/player';
import { 
  Box, 
  Button, 
  FormControl, 
  InputLabel, 
  MenuItem, 
  Select, 
  TextField, 
  Typography, 
  Checkbox,
  FormControlLabel, 
} from '@mui/material';
import React, { useState } from 'react';
  
export const DevPlayer: React.FC = () => {
  const playerData = Player.instance;
  const [speed, setSpeed] = useState(playerData?.playerMovement?.moveSpeed ?? 20);
  const [selectedAnimation, setSelectedAnimation] = useState(playerData?.currentAnimation ?? '');
  const [collisionEnabled, setCollisionEnabled] = useState(true); // Default value, adjust as needed
  const [gravityEnabled, setGravityEnabled] = useState(true);    // Default value, adjust as needed
    
  const handleSpeedChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newSpeed = Number(event.target.value);
    setSpeed(newSpeed);
    if (playerData) {
      playerData.playerMovement.moveSpeed = newSpeed;

    }
  };
    
  const handleAnimationChange = (event: React.ChangeEvent<{ value: unknown }>) => {
    setSelectedAnimation(event.target.value as string);
  };
    
  const handlePlayAnimation = () => {
    playerData?.playAnimation(selectedAnimation, 0, true);
  };
  
  const handleCollisionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const enabled = event.target.checked;
    setCollisionEnabled(enabled);
    Player.instance?.setUseCollision(enabled);
  };
  
  const handleGravityChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const enabled = event.target.checked;
    Player.instance!.playerMovement.gravity = enabled;
    setGravityEnabled(enabled);
  };
    
  return (
    <Box sx={{ 
      p: 2, 
      '*': {
        color: 'white !important',
      },
    }}>
      {/* Speed Input */}
      <Box sx={{ mb: 2, mt: 0 }}>
        <TextField
          label="Move Speed"
          type="number"
          value={speed}
          onChange={handleSpeedChange}
          variant="outlined"
          size="small"
          sx={{ width: 220 }}
          inputProps={{ min: 0, step: 1 }}
        />
      </Box>
      {/* Collision and Gravity Checkboxes */}
      <Box sx={{ display: 'flex', flexDirection: 'row', gap: 1 }}>
        <FormControlLabel
          control={
            <Checkbox
              size='small'

              checked={collisionEnabled}
              onChange={handleCollisionChange}
              color="primary"
            />
          }
          label="Collision"
        />
        <FormControlLabel
        
          control={
            <Checkbox
              size='small'
              checked={gravityEnabled}
              onChange={handleGravityChange}
              color="primary"
            />
          }
          label="Gravity"
        />
      </Box>

    
      {/* Animation Selector and Play Button */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <FormControl sx={{ minWidth: 200 }}>
          <InputLabel id="animation-select-label">Animation</InputLabel>
          <Select
            labelId="animation-select-label"
            value={selectedAnimation}
            label="Animation"
            onChange={handleAnimationChange}
            size="small"
          >
            {playerData?.animations.map((anim) => (
              <MenuItem key={anim} value={anim}>
                {anim}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button
          variant="contained"
          onClick={handlePlayAnimation}
          size="small"
        >
            Play
        </Button>
      </Box>
  

    </Box>
  );
};