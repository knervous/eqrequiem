import emitter from "@game/Events/events";
import { ItemInstance } from "@game/Net/messages";
import Pako from "pako";

export interface JsonCommandLink {
  linkType: number;
  label: string;
  data: string; // Base64 and pako compressed encoded data
}

export const LinkTypes = {
  ItemLink: 0,
  SummonItem: 1,
} as const;

export const parseCommandLink = (text: string): JsonCommandLink | null => {
  try {
    return JSON.parse(
      Buffer.from(text, "base64").toString("utf-8"),
    ) as JsonCommandLink;
  } catch (e) {
    console.error("Error parsing command link:", e);
    return null;
  }
};

export const decodeItem = (commandLink: JsonCommandLink): ItemInstance => {
  const bytes = Buffer.from(commandLink.data, "base64");
  const decompressedBytes = Pako.inflate(bytes);
  return ItemInstance.decode(decompressedBytes);
};

export const encodeItem = (item: Partial<ItemInstance>): JsonCommandLink => {
  const compressedBytes = Pako.deflate(ItemInstance.encode(item));
  return {
    linkType: LinkTypes.ItemLink,
    label: item.name || "Unknown Item",
    data: Buffer.from(compressedBytes).toString("base64"),
  };
};

export const linkItemToChat = (item: Partial<ItemInstance>): void => {
  const commandLink = encodeItem(item);
  emitter.emit("chatCommandLink", commandLink);
};
