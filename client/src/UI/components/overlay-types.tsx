export type MessagePayload = object & {
  type: string;
  payload: object;
};

// Create an interface for our custom message handler.
export interface IMessageHandler {
  postMessage(message: object | string): void;
}

export interface IMessageTarget {
  addEventListener(
    event: string,
    callback: (message: MessagePayload) => void,
  ): void;
  removeEventListener(
    event: string,
    callback: (message: MessagePayload) => void,
  ): void;
}

export const stateKey = "uiState";
