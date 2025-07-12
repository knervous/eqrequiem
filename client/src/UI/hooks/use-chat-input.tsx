// src/hooks/use-chat-input.tsx
import { useState, useRef, useCallback } from 'react';
import { CommandParser } from '@game/ChatCommands/command-parser';

export const useChatInput = () => {
  const [inputValue, setInputValue] = useState('');
  const [historyStack, setHistoryStack] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target?.value ?? '');
      setHistoryIndex(-1); // Reset history when typing
    },
    [],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        if (inputValue.trim()) {
          setHistoryStack((prev) => [inputValue, ...prev]);
          setHistoryIndex(-1);
          CommandParser.parseCommand(inputValue);
          setInputValue('');
          setTimeout(() => inputRef.current?.blur(), 10);
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setInputValue('');
        setHistoryIndex(-1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (historyStack.length > 0 && historyIndex < historyStack.length - 1) {
          const newIndex = historyIndex + 1;
          setHistoryIndex(newIndex);
          setInputValue(historyStack[newIndex]);
        }
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (historyIndex > -1) {
          const newIndex = historyIndex - 1;
          setHistoryIndex(newIndex);
          setInputValue(newIndex === -1 ? '' : historyStack[newIndex]);
        }
      }
    },
    [inputValue, historyStack, historyIndex],
  );

  return {
    inputValue,
    historyIndex,
    inputRef,
    messagesEndRef,
    handleInputChange,
    handleKeyDown,
  };
};
