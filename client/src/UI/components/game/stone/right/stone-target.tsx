import { useTarget } from '@game/Events/event-hooks';
import { Stack, Typography } from '@mui/material';
import { useSakImage } from '@ui/hooks/use-image';


export const StoneTarget: React.FC = () => {
  const hpFill = useSakImage('Classic_HP_Fill', true);

  const target = useTarget();
  return ! target ? null : (
    <Stack  
      direction={'column'}
      sx={{
        position       : 'relative',
        top            : 45,
        left           : 30,
        width          : 'calc(100% - 55px)',
        height         : `${hpFill.entry.height * 4.5}px`,
        backgroundImage: `url(${hpFill.image})`,
        backgroundSize : 'cover',
        justifyContent : 'center',
        alignItems     : 'center',
      }}
    >
      <Typography sx={{ fontSize: 25, color: '#ddd' }}>
        {target.cleanName}
      </Typography>
      <Typography sx={{ fontSize: 25, color: 'white' }}>
        {target.spawn.curHp}%
      </Typography>
    </Stack>
  );
};
