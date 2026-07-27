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

const generatedIconUrl = (icon: number): string | null =>
  Number.isInteger(icon) && icon >= 500
    ? `/eltania/items/icons/v1/${icon}.webp`
    : null;

export const itemVisualUrls = (
  item: Pick<ItemInstance, 'icon' | 'idfile'>,
): string[] => {
  const urls = [generatedIconUrl(item.icon)];
  // IT63 is a shared legacy placeholder, not a meaningful visual identity.
  if (item.idfile.toLowerCase() !== 'it63') urls.push(catalogIconUrl(item.idfile));
  return urls.filter((url): url is string => Boolean(url));
};

export const ItemVisual: React.FC<{
  item: ItemInstance;
  isContainer?: boolean;
}> = ({ item, isContainer = false }) => {
  const urls = itemVisualUrls(item);
  const urlsKey = urls.join('|');
  const [imageIndex, setImageIndex] = useState(0);
  const url = urls[imageIndex];

  useEffect(() => setImageIndex(0), [urlsKey]);

  if (url) {
    return (
      <img
        alt=""
        aria-hidden="true"
        className="rq-item-art"
        draggable={false}
        src={url}
        onError={() => setImageIndex((index) => index + 1)}
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
