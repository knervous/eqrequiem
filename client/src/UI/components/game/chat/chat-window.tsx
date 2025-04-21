// src/components/ChatWindowComponent.tsx
import React, { useEffect, useMemo } from "react";
import { Box, Stack, TextField } from "@mui/material";
import { ChatWindow } from "../../../state/initial-state";
import { UiAction } from "../../../state/reducer";
import { UiWindowComponent } from "../../../common/ui-window";
import { useChatInput } from "../../../hooks/use-chat-input";
import { useChatFocus } from "../../../hooks/use-chat-focus";

type Props = {
  state: ChatWindow;
  index: number;
  messages: string[];
  main: boolean;
  dispatcher: React.Dispatch<UiAction>;
};

export const ChatWindowComponent: React.FC<Props> = ({
  state,
  index,
  messages,
  main,
}) => {
  const {
    inputValue,
    inputRef,
    messagesEndRef,
    handleInputChange,
    handleKeyDown,
  } = useChatInput();

  useChatFocus(main, inputRef, inputValue, handleInputChange);

  // Scroll to the latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages, messagesEndRef]);

  // Memoized styles for performance
  const chatStyles = useMemo(
    () => ({
      container: {
        height: "calc(100% - 10px)",
        fontFamily: "Arial, sans-serif",
        paddingTop: "10px",
      },
      messages: {
        userSelect: "none" as const,
        flexGrow: 1,
        overflowY: "auto" as const,
        p: 1,
        color: "#ddd",
        fontSize: "14px",
        lineHeight: "1.2",
        "&::-webkit-scrollbar": { width: "4px" },
        "&::-webkit-scrollbar-thumb": { backgroundColor: "#555" },
      },
      inputBox: { p: 0.5 },
      textField: {
        "& .MuiOutlinedInput-root": {
          "& fieldset": { border: "none" },
          "&:hover fieldset": { border: "none" },
          "&.Mui-focused fieldset": { border: "none" },
        },
      },
      inputProps: {
        className: "cursor-caret",
        style: {
          border: "1px solid gray",
          color: "#ffffff",
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          fontSize: "14px",
          height: "24px",
        },
      },
    }),
    [],
  );

  return (
    <UiWindowComponent
      state={state}
      index={index}
      title="Chat"
      windowName="chatWindows"
    >
      <Stack sx={chatStyles.container} direction="column">
        <Box sx={chatStyles.messages}>
          {messages.map((message, idx) => (
            <Box key={idx} sx={{ wordBreak: "break-word" }}>
              {message}
            </Box>
          ))}
          <div ref={messagesEndRef} />
        </Box>
        <Box sx={chatStyles.inputBox}>
          <TextField
            autoComplete="off"
            fullWidth
            inputRef={inputRef}
            sx={chatStyles.textField}
            size="small"
            variant="outlined"
            InputProps={chatStyles.inputProps} // Includes className="cursor-caret"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Enter message..."
          />
        </Box>
      </Stack>
    </UiWindowComponent>
  );
};
