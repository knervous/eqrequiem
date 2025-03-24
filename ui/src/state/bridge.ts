

type MainInvoke = (msg: object) => void;

export const MainInvoker: { current: MainInvoke | null } = {
    current: null,
}
export type ActionType = "chat" | "inventory";

export type ClientUIMessage = (msg: unknown) => void;
export type ClientActionHandlerType = {
    [key: string]: ClientUIMessage;
}
export const ClientActionHandler : ClientActionHandlerType = {
};