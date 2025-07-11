import { InventorySlot } from '@game/Player/player-constants';
import { Box, Grid } from '@mui/material';
import { ItemButton } from '../../action-button/item-button';


export const StoneGeneralInv: React.FC<{
  scale: number;
  contain?: boolean;
}> = ({ scale, contain = false }) => {

  return (
    <Box
      sx={
        contain
          ? {
            height: 'calc(100%)',
          }
          : {
            // width : 'calc(100%)',
            width : '100%',
            height: '550px',
            mb    : 4,
          }
      }
    >
      <Grid container columns={16} sx={{ height: '100%' }}>
        {[
          InventorySlot.General1,
          InventorySlot.General2,
          InventorySlot.General3,
          InventorySlot.General4,
          InventorySlot.General5,
          InventorySlot.General6,
          InventorySlot.General7,
          InventorySlot.General8,
        ].map((slot, idx) => (
          <Grid
            key={`${idx}`}
            size={8}
            sx={{ height: 'calc(100% / 4)' }}
          >
            <ItemButton
              scale={scale}
              slot={slot}
            />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};
