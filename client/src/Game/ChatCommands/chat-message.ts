import emitter, { ChatMessage } from '@game/Events/events';

export const chatMessage = (message: Partial<ChatMessage>): void => {
  emitter.emit('chatMessage', {
    type   : message.type ?? 0,
    message: message?.message ?? '',
    color  : message?.color ?? '#ddd',
    chanNum: message?.chanNum ?? 0,
  });
};


export const addChatLine = (message: string) => {
  chatMessage({
    type   : 0,
    message,
    color  : '#ddd',
    chanNum: 0, 
  });
};

export const addChatLines = (lines: string | string[]) => {
  const lineArray = Array.isArray(lines)
    ? lines
    : lines
      .trim()
      .split('\n')
      .map((line) => line.trim());
  lineArray.forEach((line) => addChatLine(line));
};
