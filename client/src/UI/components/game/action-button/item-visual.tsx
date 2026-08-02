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
import { generatedItemSprite } from './item-sprite';
import './item-visual.css';

const catalogIconUrl = (idfile: string): string | null => {
  const key = idfile.trim().toLowerCase();
  return /^[a-z0-9_-]+$/.test(key)
    ? `/eltania/items/catalog/${key}.webp`
    : null;
};

const generatedIconUrl = (icon: number): string | null =>
  generatedItemSprite(icon)
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
  const sprite = generatedItemSprite(item.icon);
  const urls = itemVisualUrls(item);
  const candidates = [
    urls[0] ? { type: 'image' as const, url: urls[0] } : null,
    sprite ? { type: 'sprite' as const, url: sprite.url, sprite } : null,
    urls[1] ? { type: 'image' as const, url: urls[1] } : null,
  ].filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
  const candidatesKey = candidates.map(({ type, url }) => `${type}:${url}`).join('|');
  const [imageIndex, setImageIndex] = useState(0);
  const candidate = candidates[imageIndex];

  useEffect(() => setImageIndex(0), [candidatesKey]);

  if (candidate?.type === 'image') {
    return (
      <img
        alt=""
        aria-hidden="true"
        className="rq-item-art"
        draggable={false}
        src={candidate.url}
        onError={() => setImageIndex((index) => index + 1)}
      />
    );
  }

  if (candidate?.type === 'sprite') {
    return (
      <span aria-hidden="true" className="rq-item-art rq-item-sprite">
        <img
          alt=""
          className="rq-item-sprite__sheet"
          draggable={false}
          src={candidate.url}
          style={{
            left: `${candidate.sprite.column * -100}%`,
            top : `${candidate.sprite.row * -100}%`,
          }}
          onError={() => setImageIndex((index) => index + 1)}
        />
      </span>
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
