import {
  getClassStringListFromClassBitmask,
  getRaceStringListFromRaceBitmask,
} from '@game/Constants/util';
import { ItemInstance } from '@game/Net/messages';
import { getSlotNamesFromBitmask } from '@game/Player/player-constants';
import { Box, Stack, Tooltip, Typography } from '@mui/material';
import { Fade } from '@mui/material';
import './item-tooltip.css';

const itemTypeMap = {
  0: '1H Slashing',
  1: '2H Slashing',
  2: '1H Piercing',
  4: '2H Blunt',
  5: 'Archery',
  7: 'Throwing',
};

const signed = (value: number): string => `${value > 0 ? '+' : ''}${value}`;

export const ItemTooltip: React.FC<{
  item: ItemInstance;
  children: React.ReactElement;
}> = ({ item, children }) => {
  return (
    <Tooltip
      followCursor
      // open={true}
      placement="right"
      slotProps={{
        tooltip: {
          sx: {
            p: 0,
            m: 0,
          },
        },
        transition: {
          timeout: 150,
          easing : {
            enter: 'ease-in',
            exit : 'ease-out',
          },
        },
        popper: {
          modifiers: [
            {
              name   : 'offset',
              options: {
                offset: [0, 15],
              },
            },
          ],
        },
      }}
      slots={{
        transition: Fade,
      }}
      sx={{ m: 0, p: 0 }}
      title={
        <Box className="rq-item-tooltip" sx={{ width: '280px' }}>
          <Typography className="rq-item-tooltip__title">
            {item.name}
          </Typography>
          <Box
            className="item-tooltip"
            sx={{
              padding        : '10px 12px 11px',
              color          : '#fff',
              display        : 'flex',
              flexDirection  : 'column',
              gap            : '1px',
            }}
          >
            <Stack alignItems="center" direction="row" spacing={1}>
              {item.magic ? (
                <Typography sx={{ fontSize: '11px', color: 'lightgreen' }}>
                  MAGIC
                </Typography>
              ) : null}
              {Number(item.nodrop) === 0 ? (
                <Typography sx={{ fontSize: '11px', color: 'white' }}>
                  NO DROP
                </Typography>
              ) : null}
            </Stack>
            {item.slots > 0 ? (
              <Typography sx={{ fontSize: '11px' }}>
                Slot: {getSlotNamesFromBitmask(item.slots)}
              </Typography>
            ) : null}
            {itemTypeMap[item.itemtype] ? (
              <Typography sx={{ fontSize: '11px' }}>
                Skill: {itemTypeMap[item.itemtype]}
              </Typography>
            ) : null}
            {item.damage > 0 ? (
              <Typography sx={{ fontSize: '11px' }}>
                DMG: {item.damage} Delay: {item.delay}
              </Typography>
            ) : null}
            {item.ac > 0 ? (
              <Typography sx={{ fontSize: '11px' }}>AC: {item.ac}</Typography>
            ) : null}
            <Stack direction="row" spacing={1}>
              {['astr', 'asta', 'adex', 'aagi', 'aint', 'awis', 'acha'].map(
                (stat) => {
                  if (Number(item[stat] ?? 0) !== 0) {
                    return (
                      <Typography key={stat} sx={{ fontSize: '11px' }}>
                        {stat.slice(1).toUpperCase()} {signed(Number(item[stat]))}
                      </Typography>
                    );
                  }
                },
              )}
            </Stack>
            <Stack direction="row" spacing={1}>
              {['hp', 'mana', 'dr', 'mr', 'cr', 'fr', 'pr'].map((stat) => {
                if (Number(item[stat] ?? 0) !== 0) {
                  return (
                    <Typography key={stat} sx={{ fontSize: '11px' }}>
                      {stat.toUpperCase()} {signed(Number(item[stat]))}
                    </Typography>
                  );
                }
              })}
            </Stack>
            {item.haste > 0 ? (
              <Typography sx={{ fontSize: '11px' }}>
                Haste: {item.haste}%
              </Typography>
            ) : null}
            <Typography sx={{ fontSize: '11px' }}>
              WT: {(Number(item.weight ?? 0) / 10).toFixed(1)}
            </Typography>

            <Typography sx={{ fontSize: '11px' }}>
              Class: {getClassStringListFromClassBitmask(item.classes)}
            </Typography>
            <Typography sx={{ fontSize: '11px' }}>
              Race: {getRaceStringListFromRaceBitmask(item.races)}
            </Typography>

            <Typography sx={{ fontSize: '10px', mt: 2 }}>
              Ctrl + Left Click to Link
            </Typography>
            {/* <Typography sx={{ fontSize: '10px', mt: 0 }}>
              Shift + Click: Persist Window
            </Typography> */}
          </Box>
        </Box>
      }
    >
      {children}
    </Tooltip>
  );
};
