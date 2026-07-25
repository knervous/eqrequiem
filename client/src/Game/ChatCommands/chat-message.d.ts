import { ChatMessage } from '@game/Events/events';
export declare const chatMessage: (message: Partial<ChatMessage>) => void;
export declare const addChatLine: (message: string) => void;
export declare const addChatLines: (lines: string | string[]) => void;
