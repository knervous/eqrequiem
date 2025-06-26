// src/components/ChatWindowComponent.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Box, Stack, TextField } from "@mui/material";
import { useChatInput } from "../../../../hooks/use-chat-input";
import { UiTitleComponent } from "@ui/common/ui-title";
import emitter, { ChatMessage } from "@game/Events/events";
import { useSakImage } from "@ui/hooks/use-image";

export const StoneMiddle: React.FC<{ width: number }> = ({ width }) => {
  const {
    inputValue,
    inputRef,
    messagesEndRef,
    handleInputChange,
    handleKeyDown,
  } = useChatInput();
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    const addMessage = (message: ChatMessage) => {
      setMessages((prevMessages) => [...prevMessages, message]);
    };
    emitter.on("chatMessage", addMessage);
    return () => {
      emitter.off("chatMessage", addMessage);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && inputRef.current !== document.activeElement) {
        inputRef.current?.focus();
        handleInputChange({ target: { value: e.key } } as React.ChangeEvent<HTMLInputElement>);
      } else if (e.key === "Enter" && inputRef.current !== document.activeElement) {
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [inputRef, handleInputChange]);

  const bg = useSakImage("BG_Dark2", true);
  console.log("bg", bg);
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
        opacity: 1.0,
        background: `url(${bg.image})`,
        backgroundSize: "",
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
    [bg.image],
  );

  return (
    <Box
      sx={{
        height: "calc(100% - 5px)",
        width,
        overflow: "visible",
        position: "relative",
      }}
    >
      <UiTitleComponent
        closable={false}
        name={"Chat"}
        minimized={false}
        toggleMinimize={() => {}}
        useMargin={false}
        draggable={false}
        handleDragMouseDown={() => {}}
      />
      <Stack sx={chatStyles.container} direction="column">
        <Box sx={chatStyles.messages}>
          {messages.map((chatMessage, idx) => (
            <Box
              key={idx}
              sx={{
                wordBreak: "break-word",
                color: chatMessage.color ?? "#ddd",
              }}
            >
              {chatMessage.message}
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
    </Box>
  );
};
