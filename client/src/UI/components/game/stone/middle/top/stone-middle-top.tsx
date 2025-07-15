import { useInventoryOpen } from '@game/Events/event-hooks';
import { StoneInventory } from './stone-inventory';

export const StoneMiddleTop: React.FC<{
  width: number;
  height: number;
  scale: number;
}> = ({ width, height, scale }) => {
  const inventoryOpen = useInventoryOpen();
  
  return (
    <StoneInventory height={height} open={inventoryOpen} scale={scale} width={width} />
  );
};
