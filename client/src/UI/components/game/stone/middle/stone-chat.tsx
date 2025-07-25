// src/UI/components/game/stone/middle/stone-chat.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CommandParser } from '@game/ChatCommands/command-parser';
import emitter, { ChatMessage } from '@game/Events/events';
import { Box, Stack } from '@mui/material';
import { useSakImage, useSakImages } from '@ui/hooks/use-image';
import { ParsedMessage } from './command-link';
import type { JsonCommandLink } from './command-link-util';
import { ChatInputSlate } from './stone-chat-input';

// Configuration for all stone frame pieces
const stoneConfigs = [
  { key: 'topLeft', name: 'A_ClassicTopLeft', bgSize: 'cover' },
  { key: 'top', name: 'A_ClassicTop', bgSize: 'cover' },
  { key: 'topRight', name: 'A_ClassicTopRight', bgSize: 'cover' },
  { key: 'midLeft', name: 'A_ClassicLeft', bgSize: '' },
  { key: 'mid', name: 'BG_Light', bgSize: '' },
  { key: 'midRight', name: 'A_ClassicRight', bgSize: '' },
  { key: 'botLeft', name: 'A_ClassicBottomLeft', bgSize: 'cover' },
  { key: 'bot', name: 'A_ClassicBottom', bgSize: '' },
  { key: 'botRight', name: 'A_ClassicBottomRight', bgSize: 'cover' },
];

// Component to render a row of stone pieces
const StoneRow: React.FC<{
  keys: string[];
  stoneImages: Record<string, any>;
  width: number;
  height: number | string;
}> = ({ keys, stoneImages, height, width }) => (
  <Stack direction="row" spacing={0} sx={{ position: 'relative' }}>
    {keys.map((key) => {
      const { entry, image, bgSize } = stoneImages[key];
      const widthPx = entry.width;
      return (
        <Box
          key={key}
          sx={{
            width          : ['top', 'mid', 'bot'].includes(key) ? width - 7 : widthPx,
            height,
            position       : 'relative',
            backgroundImage: `url(${image})`,
            backgroundSize : bgSize,
          }}
        />
      );
    })}
  </Stack>
);
const imageNames = stoneConfigs.map(({ name }) => `${name}`);

export const StoneMiddleBottom: React.FC<{
  width: number;
  height: number;
}> = ({ width, height }) => {

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const chatRef = React.useRef<HTMLDivElement>(null);
  const bgImages = useSakImages(imageNames, true);
  const stoneImages = useMemo(
    () =>
      stoneConfigs.reduce(
        (acc, { key, bgSize }, idx) => {
          acc[key] = {
            entry: bgImages[idx]?.entry ?? {},
            image: bgImages[idx]?.image ?? '',
            bgSize,
          };
          return acc;
        },
        {} as Record<string, any>,
      ),
    [bgImages],
  );
  const topHeight = stoneImages.topLeft.entry.height;
  const middleHeight = height - (topHeight * 2);
  const chatBg = useSakImage('A_ChatBackground', true);

  const onExecuteCommand = useCallback((payload: JsonCommandLink) => {
    switch (payload.linkType) {
      case 0: // Item Link
        break;
      case 1: // Summon Item
        CommandParser.parseCommand(`#si ${payload.data}`);
        break;
      default:
        console.warn(`Unknown link type: ${payload.linkType}`);
    }
  }, []);

  useEffect(() => {
    const addMessage = (message: ChatMessage) => {
      setMessages((prevMessages) => [...prevMessages, message]);
    };
    emitter.on('chatMessage', addMessage);
    return () => {
      emitter.off('chatMessage', addMessage);
    };
  }, [onExecuteCommand]);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);


  // Memoized styles for performance
  const chatStyles = useMemo(
    () => ({
      container: {
        width     : '100%',
        fontFamily: 'Arial, sans-serif',
        zIndex    : 100,
        m         : '7px',
        p         : '5px',
        height    : `${height - 24}px`,
        boxShadow : [
          'inset 0 0 12px rgba(0,0,0,0.15)', // Soft overall shadow
          'inset 0 6px 10px rgba(0,0,0,0.1)', // Top shadow
          'inset 6px 0 10px rgba(0,0,0,0.1)', // Left shadow
          'inset -6px 0 10px rgba(0,0,0,0.1)', // Right shadow
          'inset 0 -6px 10px rgba(0,0,0,0.1)', // Bottom shadow
        ].join(','),
        background: `
        linear-gradient(
      to right,
      rgba(0,0,0,0.3) 0%,
      transparent 15%,
      transparent 85%,
      rgba(0,0,0,0.3) 100%
    ),
    linear-gradient(
      to bottom,
      rgba(0,0,0,0.3) 0%,
      transparent 15%,
      transparent 85%,
      rgba(0,0,0,0.3) 100%
    ), url(${chatBg.image})
  `,
        backgroundSize: 'cover',

      },
      messages: {
        // userSelect                  : 'none' as const,
        flexGrow                    : 1,
        overflowY                   : 'auto' as const,
        p                           : 1,
        color                       : '#ddd',
        fontSize                    : '14px',
        lineHeight                  : '1.2',
        '&::-webkit-scrollbar'      : { width: '4px' },
        '&::-webkit-scrollbar-thumb': { backgroundColor: '#555' },
      },
      inputBox : { },
      textField: {
        '& .MuiOutlinedInput-root': {
          '& fieldset'            : { border: 'none' },
          '&:hover fieldset'      : { border: 'none' },
          '&.Mui-focused fieldset': { border: 'none' },
        },
        margin : 0,
        padding: 0,
      },
      inputProps: {
        className: 'cursor-caret',
        style    : {
          color          : '#dedede',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          fontSize       : '14px',
          height         : '24px',
          margin         : 0,
          padding        : '0px !important',
        },
      },
    }),
    [chatBg.image, height],
  );

  return (
    <Box
      sx={{
        width,
        overflow: 'visible',
      }}
    >
     
      <StoneRow
        height={topHeight}
        keys={['topLeft', 'top', 'topRight']}
        stoneImages={stoneImages}
        width={width}
      />
      <StoneRow
        height={`${middleHeight}px`}
        keys={['midLeft', 'mid', 'midRight']}
        stoneImages={stoneImages}
        width={width}
      />
      <StoneRow
        height={topHeight}
        keys={['botLeft', 'bot', 'botRight']}
        stoneImages={stoneImages}
        width={width}
      />
      <Stack
        direction="row"
        sx={{
          height    : `${height - 14}px`,
          width     : `${width}px`,
          zIndex    : 100,
          position  : 'absolute',
          top       : 0,
          background: 'transparent',
        }}
      >
        <Stack direction="column" sx={chatStyles.container}>
          <Box ref={chatRef} sx={chatStyles.messages}>
            {messages.map((chatMessage, idx) => (
              <Box
                key={idx}
                sx={{
                  wordBreak : 'break-word',
                  fontSize  : '16px',
                  fontFamily: 'Arial, sans-serif',
                  color     : chatMessage.color || '#111',
                }}
              >
                <ParsedMessage
                  text={chatMessage.message as string}
                  onExecute={onExecuteCommand}
                />
              </Box>
            ))}
          </Box>
          <Box sx={chatStyles.inputBox}>
            <ChatInputSlate
              onExecuteCommand={onExecuteCommand}
              onSubmit={(msg) => {
                CommandParser.parseCommand(msg);
              }}
            />
          </Box>
        </Stack>

      </Stack>
    </Box>
  );
};
