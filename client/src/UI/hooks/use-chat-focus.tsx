// src/hooks/use-chat-focus.tsx
import { useEffect, useCallback } from "react";

export const useChatFocus = (
  main: boolean,
  inputRef: React.RefObject<HTMLInputElement>,
  inputValue: string,
  setInputValue: (value: string) => void,
) => {
  useEffect(() => {
    if (!main) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && inputRef.current !== document.activeElement) {
        inputRef.current?.focus();
        setInputValue("/");
      } else if (e.key === "Enter" && inputRef.current !== document.activeElement) {
        inputRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [main, inputRef, setInputValue]);
};