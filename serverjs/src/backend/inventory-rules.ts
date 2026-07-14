export interface InventoryPosition {
  slot: number;
  bag: number;
}

export interface InventoryRecord extends InventoryPosition {
  itemKey: string | number;
  containerSlots?: number;
}

export interface PlannedInventoryMove extends InventoryPosition {
  itemKey: string | number;
  fromSlot: number;
  fromBag: number;
}

export function planInventorySwap(
  inventory: readonly InventoryRecord[],
  from: InventoryPosition,
  to: InventoryPosition,
): PlannedInventoryMove[] {
  const at = (position: InventoryPosition) => inventory.find(
    (row) => row.slot === position.slot && row.bag === position.bag,
  );
  const source = at(from);
  const destination = at(to);
  if (!source && !destination) return [];

  const sourceChildren = from.bag <= 0
    ? inventory.filter((row) => row.slot === from.slot && row.bag > 0)
    : [];
  const destinationChildren = to.bag <= 0
    ? inventory.filter((row) => row.slot === to.slot && row.bag > 0)
    : [];
  const sourceIsContainer = Number(source?.containerSlots ?? sourceChildren.length) > 0;
  const destinationIsContainer =
    Number(destination?.containerSlots ?? destinationChildren.length) > 0;
  if (to.bag > 0 && sourceIsContainer) {
    throw new Error("cannot move a container inside another container");
  }
  if (from.bag > 0 && destinationIsContainer) {
    throw new Error("cannot swap a container into another container");
  }

  return [
    ...(source ? [move(source, to)] : []),
    ...(destination ? [move(destination, from)] : []),
    ...sourceChildren.map((row) => move(row, { slot: to.slot, bag: row.bag })),
    ...destinationChildren.map((row) =>
      move(row, { slot: from.slot, bag: row.bag }),
    ),
  ];
}

export function movementConfirmations(
  moves: readonly PlannedInventoryMove[],
  from: InventoryPosition,
  to: InventoryPosition,
): Array<{ fromSlot: number; toSlot: number; fromBag: number; toBag: number }> {
  if (moves.length === 0) return [];
  const confirmations = [{
    fromSlot: from.slot,
    toSlot: to.slot,
    fromBag: from.bag,
    toBag: to.bag,
  }];
  const childBags = new Set(
    moves
      .filter((move) => move.fromBag > 0)
      .map((move) => move.fromBag),
  );
  for (const bag of childBags) {
    confirmations.push({
      fromSlot: from.slot,
      toSlot: to.slot,
      fromBag: bag,
      toBag: bag,
    });
  }
  return confirmations;
}

function move(
  row: InventoryRecord,
  target: InventoryPosition,
): PlannedInventoryMove {
  return {
    itemKey: row.itemKey,
    fromSlot: row.slot,
    fromBag: row.bag,
    slot: target.slot,
    bag: target.bag,
  };
}
