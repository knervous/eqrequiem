import { useMemo } from 'react';
import { usePlayerInventory } from '@game/Events/event-hooks';
import { InventorySlot } from '@game/Player/player-constants';
import { Box, Grid } from '@mui/material';
import { ItemButton } from '../../action-button/item-button';


export const StoneGeneralInv: React.FC<{
  scale: number;
  contain?: boolean;
}> = ({ scale, contain = false }) => {
  const inventory = usePlayerInventory();
  const generalInventory = useMemo(() => {
    return {
      [InventorySlot.General1]: inventory?.get(InventorySlot.General1),
      [InventorySlot.General2]: inventory?.get(InventorySlot.General2),
      [InventorySlot.General3]: inventory?.get(InventorySlot.General3),
      [InventorySlot.General4]: inventory?.get(InventorySlot.General4),
      [InventorySlot.General5]: inventory?.get(InventorySlot.General5),
      [InventorySlot.General6]: inventory?.get(InventorySlot.General6),
      [InventorySlot.General7]: inventory?.get(InventorySlot.General7),
      [InventorySlot.General8]: inventory?.get(InventorySlot.General8),
    };
  }, [inventory]);
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
        {Object.entries(generalInventory).map(([slot, item], idx) => (
          <Grid
            key={idx}
            size={8}
            sx={{ height: 'calc(100% / 4)' }}
          >
            <ItemButton
              item={item}
              scale={scale}
              slot={+slot as InventorySlot}
            />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};
