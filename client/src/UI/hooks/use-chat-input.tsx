// src/hooks/use-chat-input.tsx
import { useState, useRef, useCallback } from "react";
import { UIEvents } from "@ui/events/ui-events";
import Player from "@game/Player/player";
import GameManager from "@game/Manager/game-manager";

const chatCommandHandler = async (message: string) => {
  const addChatLine = (line: string) => UIEvents.emit("chat", { type: 0, line, color: '#ddd' });
  if (message.startsWith("/")) {
    const [command, ...args] = message
      .substring(1)
      .split(" ") 
      .filter(Boolean);
    console.log("Got command", command);

    switch (command) {
      case 'speed':
        if (+args[0] > 0 && Player.instance) { 
          Player.instance.move_speed = +args[0];
          addChatLine(`Speed set to ${args[0]}`);
        } else {
          addChatLine("Invalid speed value");
        }
        break;
      case "help":
        addChatLine("----- Available commands -----");
        addChatLine("/zone {shortname} - Example /zone qeynos2");
        addChatLine("/spawn {model} - Example /spawn hum");
        addChatLine("/controls - Displays controls");
        break;
      case "zone":
      {
        const zone = args[0];
        if (zone) {
          addChatLine(`LOADING, PLEASE WAIT...`);
          await GameManager.instance.loadZone(zone);
          await GameManager.instance.instantiatePlayer();
          addChatLine(`You have entered ${zone}`);
        } else {
          addChatLine("No zone entered");
        }
        break;
      }
        
      case "camp":
      {
        addChatLine("Camping...");
        GameManager.instance.dispose();
        break;
      }
      case "spawn":
      {
        const spawn = args[0];
        if (spawn) {
          addChatLine(`Spawning ${spawn}`);
          GameManager.instance.spawnModel(spawn);
        } else {
          addChatLine("No model entered");
        }
        
        break;
      }
      case "controls":
        addChatLine("Movement: W, A, S, D");
        addChatLine("Jump (Up): Space");
        addChatLine("Sprint: Shift");
        addChatLine("Crouch (Down): Ctrl");
        addChatLine("Look around: Mouse with Right Click = Mouse lock");
        break;
      case "test":
        addChatLine("Test command");
        break;
      default:
        console.log("Unknown command");
    }
  } else {
    addChatLine(`You say, '${message}'`);
  }
};

export const useChatInput = () => {
  const [inputValue, setInputValue] = useState("");
  const [historyStack, setHistoryStack] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target?.value ?? '');
    setHistoryIndex(-1); // Reset history when typing
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        if (inputValue.trim()) {
          setHistoryStack((prev) => [inputValue, ...prev]);
          setHistoryIndex(-1);
        
          chatCommandHandler(inputValue);
          setInputValue("");
          setTimeout(() => inputRef.current?.blur(), 10);
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        setInputValue("");
        setHistoryIndex(-1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        if (historyStack.length > 0 && historyIndex < historyStack.length - 1) {
          const newIndex = historyIndex + 1;
          setHistoryIndex(newIndex);
          setInputValue(historyStack[newIndex]);
        }
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        if (historyIndex > -1) {
          const newIndex = historyIndex - 1;
          setHistoryIndex(newIndex);
          setInputValue(newIndex === -1 ? "" : historyStack[newIndex]);
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