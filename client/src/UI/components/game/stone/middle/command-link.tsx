// src/UI/components/game/stone/middle/command-link.tsx
import React, { useMemo } from 'react';
import emitter from '@game/Events/events';
import { Box, Typography } from '@mui/material';
import { ItemTooltip } from '../../action-button/item-tooltip';
import { decodeItem, type JsonCommandLink, linkItemToChat, LinkTypes, parseCommandLink } from './command-link-util';

export const CommandLink: React.FC<{
  payload: JsonCommandLink;
  onExecute: (payload: JsonCommandLink) => void;
}> = ({ payload, onExecute }) => {
  return (
    <Typography
      sx={{
        color      : 'aquamarine',
        display    : 'inline-block',
        ['&:hover']: { textDecoration: 'underline', color: '#1e81c3' },
      }}
      onClick={() => onExecute(payload)}
    >
      {payload.label}
    </Typography>
  );
};
const textSplitRegex = /(\{\{[\s\S]*?\}\})/g;
const textSplitRegexMatch = /^\{\{\s*([\s\S]*?)\s*\}\}$/;

export const ParsedMessage: React.FC<{
  text: string;
  onExecute: (payload: JsonCommandLink) => void;
}> = ({ text, onExecute }) => {
  const parts = useMemo(() => text.split(textSplitRegex), [text]);
  return useMemo(
    () =>
      parts.map((part, i) => {
        const match = part.match(textSplitRegexMatch);
        if (!match) {
          return <React.Fragment key={i}>{part}</React.Fragment>;
        }
        const commandLink = parseCommandLink(match[1]);
        if (!commandLink) {
          return <React.Fragment key={i}>{part}</React.Fragment>;
        }

        if (commandLink.linkType === LinkTypes.ItemLink) {
          const item = decodeItem(commandLink);
          return (
            <ItemTooltip key={i} item={item}>
              <Box sx={{ display: 'inline-block' }}>
                <CommandLink
                  key={i}
                  payload={commandLink}
                  onExecute={() => linkItemToChat(item)}
                />
              </Box>
            </ItemTooltip>
          );
        }
        return <CommandLink key={i} payload={commandLink} onExecute={onExecute} />;

      }),
    [parts, onExecute],
  );
};
