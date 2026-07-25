export type MessagePayload = object & {
    type: string;
    payload: object;
};
export interface IMessageHandler {
    postMessage(message: object | string): void;
}
export interface IMessageTarget {
    addEventListener(event: string, callback: (message: MessagePayload) => void): void;
    removeEventListener(event: string, callback: (message: MessagePayload) => void): void;
}
export declare const stateKey = "uiState";
