// src/components/CommandLink.tsx
import React, { useMemo } from 'react';
import { Typography } from '@mui/material';
import { ItemTooltip } from '../../action-button/item-tooltip';

export interface JsonCommandLink {
  linkType: number;
  label: string;
  data: any;
}

export const LinkTypes = {
  ItemLink  : 0,
  SummonItem: 1,
} as const;

const linkTypeLabels: Record<number, string> = {
  [LinkTypes.ItemLink]  : 'Item Link',
  [LinkTypes.SummonItem]: 'Summon Item',
};

export const CommandLink: React.FC<{
  payload: JsonCommandLink;
  onExecute: (payload: JsonCommandLink) => void;
}> = ({ payload, onExecute }) => {
  return (
    <Typography
      sx={{
        color      : '#9c27b0',
        display    : 'inline-block',
        ['&:hover']: { textDecoration: 'underline', color: '#1e81c3' },
      }}
      title={`${linkTypeLabels[payload.linkType]}: ${payload.label}`}
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
        try {
          const payload = JSON.parse(
            `${Buffer.from(match[1], 'base64').toString('utf-8')}`,
          ) as JsonCommandLink;
          return payload.linkType === LinkTypes.ItemLink ? (
            <ItemTooltip key={i} item={payload.data}>
              <CommandLink
                key={i}
                payload={payload}
                onExecute={onExecute}
              />
            </ItemTooltip>
          ) : (
            <CommandLink key={i} payload={payload} onExecute={onExecute} />
          );
        } catch (e) {
          return <React.Fragment key={i}>{part}</React.Fragment>;
        }
      }),
    [parts, onExecute],
  );
};
