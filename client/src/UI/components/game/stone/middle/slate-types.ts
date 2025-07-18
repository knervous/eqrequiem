// src/UI/components/game/stone/middle/slate-types.ts
import { BaseEditor, Descendant } from 'slate';
import { ReactEditor } from 'slate-react';
import type { JsonCommandLink } from './command-link-util';

export interface CommandLinkElement {
  type: 'command-link'
  payload: JsonCommandLink
  children: Descendant[] // Slate requires inline elements to have at least one text child
}

export type CustomElement = CommandLinkElement
export type CustomText = { text: string }

declare module 'slate' {
  interface CustomTypes {
    Editor: BaseEditor & ReactEditor
    Element: CustomElement
    Text: CustomText
  }
}
