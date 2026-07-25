import React from 'react';
import { JsonCommandLink } from './command-link-util';
interface ChatInputSlateProps {
    onExecuteCommand: (payload: JsonCommandLink) => void;
    onSubmit: (value: string) => void;
}
export declare const ChatInputSlate: React.FC<ChatInputSlateProps>;
export {};
