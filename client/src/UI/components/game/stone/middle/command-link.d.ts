import React from 'react';
import { type JsonCommandLink } from './command-link-util';
export declare const CommandLink: React.FC<{
    payload: JsonCommandLink;
    onExecute: (payload: JsonCommandLink) => void;
}>;
export declare const ParsedMessage: React.FC<{
    text: string;
    onExecute: (payload: JsonCommandLink) => void;
}>;
