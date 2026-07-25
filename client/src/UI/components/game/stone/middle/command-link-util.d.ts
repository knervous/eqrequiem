import { ItemInstance } from "@game/Net/messages";
export interface JsonCommandLink {
    linkType: number;
    label: string;
    data: string;
}
export declare const LinkTypes: {
    readonly ItemLink: 0;
    readonly SummonItem: 1;
};
export declare const parseCommandLink: (text: string) => JsonCommandLink | null;
export declare const decodeItem: (commandLink: JsonCommandLink) => ItemInstance;
export declare const encodeItem: (item: Partial<ItemInstance>) => JsonCommandLink;
export declare const linkItemToChat: (item: Partial<ItemInstance>) => void;
