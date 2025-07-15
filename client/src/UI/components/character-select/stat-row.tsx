import { memo } from 'react';
import {
  Divider,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { UiButtonComponent } from '@ui/common/ui-button';

// ↑ at top of file, outside of CharacterCreate
export const StatRow = memo(function StatRow({
  label,
  stat,
  value,
  isPreferred,
  baseValue,
  isDisabled,
  onDecrement,
  onIncrement,
}) {
  return (
    <Stack direction={'row'} sx={{ marginTop: '0px' }}>
      <Stack
        direction={'column'}
        justifyContent={'center'}
        minWidth={200}
        sx={{ marginTop: '15px' }}
      >
        <Typography
          noWrap
          component="div"
          fontSize={'15px'}
          paddingLeft={3}
          textAlign={'left'}
        >
          {label}:{' '}
          <Typography
            sx={{ color: isPreferred ? 'lightgreen' : 'white' }}
            variant="p"
          >
            {value}
          </Typography>
        </Typography>
      </Stack>
      <Stack
        direction={'row'}
        justifyContent={'space-between'}
        sx={{ marginTop: '15px' }}
        width={'40px'}
      >
        <UiButtonComponent
          buttonName="A_MinusBtn"
          isDisabled={value === baseValue}
          scale={1.5}
          onClick={() => onDecrement(stat)}
        />
        <UiButtonComponent
          buttonName="A_PlusBtn"
          isDisabled={isDisabled}
          scale={1.5}
          onClick={() => onIncrement(stat)}
        />
      </Stack>
    </Stack>
  );
});
