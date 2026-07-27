import { useEffect, useState } from 'react';
import type { ItemInstance } from '@game/Net/messages';
import {
  Backpack,
  Bandage,
  CupSoda,
  Package,
  ScrollText,
  Shield,
  Sword,
  Wheat,
} from 'lucide-react';

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
  // IT63 is a shared legacy placeholder, not a meaningful visual identity.
  const useCatalogArt = Boolean(url) && item.idfile.toLowerCase() !== 'it63';
  const [imageAvailable, setImageAvailable] = useState(useCatalogArt);

  useEffect(() => setImageAvailable(useCatalogArt), [useCatalogArt, url]);

  if (imageAvailable && url) {
    return (
    <img
      alt=""
      aria-hidden="true"
      className="rq-item-art"
      draggable={false}
      src={url}
      onError={() => setImageAvailable(false)}
    />
    );
  }

  const CategoryIcon = (() => {
    if (isContainer || (item.bagslots ?? 0) > 0) return Backpack;
    if ((item.damage ?? 0) > 0) return Sword;
    if (item.itemtype === 14) return Wheat;
    if (item.itemtype === 15) return CupSoda;
    if (item.itemtype === 18) return Bandage;
    if (item.itemtype === 11) return ScrollText;
    if ((item.slots ?? 0) > 0) return Shield;
    return Package;
  })();

  return (
    <CategoryIcon
      aria-hidden="true"
      className="rq-item-category-art"
      strokeWidth={1.35}
    />
  );
};
