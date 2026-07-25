import { BaseEditor, Descendant } from 'slate';
import { ReactEditor } from 'slate-react';
import type { JsonCommandLink } from './command-link-util';
export interface CommandLinkElement {
    type: 'command-link';
    payload: JsonCommandLink;
    children: Descendant[];
}
export type CustomElement = CommandLinkElement;
export type CustomText = {
    text: string;
};
declare module 'slate' {
    interface CustomTypes {
        Editor: BaseEditor & ReactEditor;
        Element: CustomElement;
        Text: CustomText;
    }
}
