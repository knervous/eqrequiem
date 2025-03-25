import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  KeyboardEvent,
} from "react";
import { Box, Stack, TextField } from "@mui/material";
import { ChatWindow } from "../../state/initial-state";
import { UiAction } from "../../state/reducer";
import { UiWindowComponent } from "../../common/ui-window";
import { MainInvoker } from "../../state/bridge";

type Props = {
  state: ChatWindow;
  index: number;
  messages: string[];
  main: boolean;
  dispatcher: React.Dispatch<UiAction>;
};

export const ChatWindowComponent: React.FC<Props> = (props: Props) => {
  const { state, dispatcher, messages, main } = props;
  const [inputValue, setInputValue] = useState("");
  const [historyStack, setHistoryStack] = useState<string[]>([]); // Stack for previous messages
  const [historyIndex, setHistoryIndex] = useState<number>(-1); // Index in history, -1 means no history selected
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null); // Ref to focus the input

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (inputValue.trim()) {
        // Only add non-empty messages to history
        setHistoryStack((prev) => [inputValue, ...prev]); // Push new message to top of stack
        setHistoryIndex(-1); // Reset index to no selection
        MainInvoker.current?.({ type: "chat", payload: inputValue });
        setInputValue("");
        setTimeout(() => {
          inputRef.current?.blur();
        },10)
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      setInputValue("");
      setHistoryIndex(-1); // Reset history navigation
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
  };

  useEffect(() => {
    if (!main) {
      return;
    }
    const cb = (e: KeyboardEvent) => {
      if (e.key === "/" && inputRef.current !== document.activeElement) {
        inputRef.current?.focus();
        setInputValue("/");
      }
      if (e.key === "Enter" && inputRef.current !== document.activeElement) {
        inputRef.current?.focus();
      }
    };

    document.addEventListener("keydown", cb);
    return () => {
      document.removeEventListener("keydown", cb);
    };
  }, [main]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages]);

  const handleFocus = useCallback(() => {
    window.ipc?.postMessage(
      JSON.stringify({ type: "webview_focus", payload: true })
    );
  }, []);

  const handleBlur = useCallback(() => {
    window.ipc?.postMessage(
      JSON.stringify({ type: "webview_focus", payload: false })
    );
  }, []);

  return (
    <UiWindowComponent
      state={state}
      dispatcher={dispatcher}
      index={props.index}
      title={"Chat"}
      windowName="chatWindows"
    >
      <Stack
        sx={{
          height: "calc(100% - 10px)",
          fontFamily: "Arial, sans-serif",
          paddingTop: "10px",
        }}
        direction="column"
      >
        <Box
          sx={{
            userSelect: "none",
            flexGrow: 1,
            overflowY: "auto",
            p: 1,
            cursor: "default",
            color: "#ddd",
            fontSize: "14px",
            lineHeight: "1.2",
            "&::-webkit-scrollbar": {
              width: "4px",
            },
            "&::-webkit-scrollbar-thumb": {
              backgroundColor: "#555",
            },
          }}
        >
          {messages?.map((message, index) => (
            <Box key={index} sx={{ wordBreak: "break-word" }}>
              {message}
            </Box>
          ))}
          <div ref={messagesEndRef} />
        </Box>
        <Box sx={{ p: 0.5 }}>
          <TextField
            fullWidth
            inputRef={inputRef} // Attach ref to the input
            sx={{
              "& .MuiOutlinedInput-root": {
                "& fieldset": { border: "none" },
                "&:hover fieldset": { border: "none" },
                "&.Mui-focused fieldset": { border: "none" },
              },
            }}
            size="small"
            variant="outlined"
            InputProps={{
              style: {
                border: "1px solid gray",
                color: "#ffffff",
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                fontSize: "14px",
                height: "24px",
              },
            }}
            value={inputValue}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onChange={(e) => {
              setInputValue(e.target.value);
              setHistoryIndex(-1); // Reset history when typing new content
            }}
            onKeyDown={handleKeyDown}
            placeholder="Enter message..."
          />
        </Box>
      </Stack>
    </UiWindowComponent>
  );
};
