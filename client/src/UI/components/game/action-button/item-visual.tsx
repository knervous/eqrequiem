import { useEffect, useState } from 'react';
import type { ItemInstance } from '@game/Net/messages';

const catalogIconUrl = (idfile: string): string | null => {
  const key = idfile.trim().toLowerCase();
  return /^[a-z0-9_-]+$/.test(key)
    ? `/eltania/items/catalog/${key}.webp`
    : null;
};

export const ItemVisual: React.FC<{
  item: ItemInstance;
  isContainer?: boolean;
}> = ({ item, isContainer = false }) => {
  const url = catalogIconUrl(item.idfile ?? '');
  const [imageAvailable, setImageAvailable] = useState(Boolean(url));

  useEffect(() => setImageAvailable(Boolean(url)), [url]);

  return imageAvailable && url ? (
    <img
      alt=""
      aria-hidden="true"
      className="rq-item-art"
      draggable={false}
      src={url}
      onError={() => setImageAvailable(false)}
    />
  ) : (
    <span
      aria-hidden="true"
      className={`rq-item-glyph${isContainer ? ' rq-item-glyph--container' : ''}`}
    />
  );
};
