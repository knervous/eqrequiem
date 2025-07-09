import emitter, { ChatMessage } from "@game/Events/events";

export const chatMessage = (message: Partial<ChatMessage>): void => {
  emitter.emit("chatMessage", {
    type: message.type ?? 0,
    message: message?.message ?? "",
    color: message?.color ?? "#ddd",
    chanNum: message?.chanNum ?? 0,
  });
};
