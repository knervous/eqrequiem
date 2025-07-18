import { capnpToPlainObject, setStructFields } from '@game/Constants/util';
import emitter from '@game/Events/events';
import { ItemInstance } from '@game/Net/internal/api/capnp/item';
import * as $ from 'capnp-es';
import Pako from 'pako';

export interface JsonCommandLink {
  linkType: number;
  label: string;
  data: string; // Base64 and pako compressed encoded data
}

export const LinkTypes = {
  ItemLink  : 0,
  SummonItem: 1,
} as const;

export const parseCommandLink = (text: string): JsonCommandLink | null => {
  try {
    return JSON.parse(Buffer.from(text, 'base64').toString('utf-8')) as JsonCommandLink;
  } catch (e) {
    console.error('Error parsing command link:', e);
    return null;
  }
};

export const decodeItem = (commandLink: JsonCommandLink) : ItemInstance => {
  const bytes = Buffer.from(commandLink.data, 'base64');
  const decompressedBytes = Pako.inflate(bytes);
  const reader = new $.Message(decompressedBytes, false);
  const root = reader.getRoot(ItemInstance);
  const item = capnpToPlainObject(root);
  return item;
};

export const encodeItem = (item: Partial<ItemInstance>): JsonCommandLink => {
  const writer = new $.Message();
  const root = writer.initRoot(ItemInstance);
  setStructFields(root, item);
  const bytes = writer.toArrayBuffer();
  const compressedBytes = Pako.deflate(new Uint8Array(bytes));
  return {
    linkType: LinkTypes.ItemLink,
    label   : item.name || 'Unknown Item',
    data    : Buffer.from(compressedBytes).toString('base64'),
  };    
};

export const linkItemToChat = (item: Partial<ItemInstance>) : void => {
  const commandLink = encodeItem(item);
  emitter.emit('chatCommandLink', commandLink);
};
