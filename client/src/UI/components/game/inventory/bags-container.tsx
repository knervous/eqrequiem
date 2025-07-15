// BagPortalManager.tsx
import React from 'react';
import { useEvent } from '@game/Events/event-hooks';
import Player from '@game/Player/player';
import type { BagState } from '@game/Player/player-inventory';
import { Bag } from './bags'; // a version of Bag that only cares about props, not its own useState

export const BagsContainer: React.FC<{scale: number}> = ({ scale }) => {
  const [localBagStates, setLocalBagStates] = React.useState<Record<number, BagState>>({});
  useEvent('updateBagState', (e: { slot: number, state: BagState }) => {
    setLocalBagStates((prev) => ({
      ...prev,
      [e.slot]: e.state,
    }));
  }); 
  return Object.entries(localBagStates)
    .filter(([_, state]) => state.open)
    .map(([slot, state]) =>
      <Bag
        key={slot}
        initialX={state.x}
        initialY={state.y}
        name={Player.instance!.playerInventory.get(+slot)!.name}
        scale={scale}
        slot={+slot}
        slots={Player.instance!.playerInventory.get(+slot)!.bagslots}
      />,
    );
};
