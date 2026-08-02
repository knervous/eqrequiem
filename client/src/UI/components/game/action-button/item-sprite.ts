export const GENERATED_ITEM_SPRITE_LAYOUT = Object.freeze({
  iconBase : 500,
  sheets   : 178,
  slots    : 36,
  columns  : 6,
  rows     : 6,
  cellSize : 40,
  sheetSize: 256,
});

export type GeneratedItemSprite = {
  url: string;
  sheet: number;
  column: number;
  row: number;
};

export function generatedItemSprite(icon: number): GeneratedItemSprite | null {
  const layout = GENERATED_ITEM_SPRITE_LAYOUT;
  const offset = icon - layout.iconBase;
  if (
    !Number.isInteger(icon) ||
    offset < 0 ||
    offset >= layout.sheets * layout.slots
  ) return null;

  const sheet = Math.floor(offset / layout.slots) + 1;
  const sheetOffset = offset % layout.slots;
  // SQLite icon IDs advance down a column. Repacked sheets store canonical
  // top-left cells in ordinary row-major pixel coordinates.
  const column = Math.floor(sheetOffset / layout.rows);
  const row = sheetOffset % layout.rows;
  return {
    url: `/eltania/items/icons/v1/sprites/dragitem${sheet}.webp`,
    sheet,
    column,
    row,
  };
}
