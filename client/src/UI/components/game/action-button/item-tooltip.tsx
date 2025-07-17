import {
  getClassStringListFromClassBitmask,
  getRaceStringListFromRaceBitmask,
} from '@game/Constants/util';
import { ItemInstance } from '@game/Net/internal/api/capnp/item';
import { getSlotNamesFromBitmask } from '@game/Player/player-constants';
import { Box, Stack, Tooltip, Typography } from '@mui/material';
import Fade from '@mui/material/Fade';
import { UiImageComponent } from '@ui/common/ui-image';
import './item-tooltip.css';

const itemTypeMap = {
  0: '1H Slashing',
  1: '2H Slashing',
  2: '1H Piercing',
  4: '2H Blunt',
  5: 'Archery',
  7: 'Throwing',
};

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
        <Box sx={{ width: '280px' }}>
          <Box
            sx={{ position: 'absolute', top: -5, width: 'calc(100% - 14px)' }}
          >
            <Stack direction="row">
              <Typography
                sx={{
                  fontSize : '11px',
                  color    : '#ccc',
                  position : 'absolute',
                  width    : '100%',
                  textAlign: 'center',
                }}
              >
                {item.name}
              </Typography>
              <UiImageComponent name={'A_WindowTitleLeft'} />
              <UiImageComponent
                crop
                name={'A_WindowTitleMiddle'}
                sx={{
                  width           : '100%',
                  backgroundRepeat: 'repeat-x',
                  backgroundSize  : 'auto 100%',
                }}
              />
              <UiImageComponent name={'A_WindowTitleRight'} />
            </Stack>
          </Box>
          <Box
            className="item-tooltip"
            sx={{
              backgroundColor: 'rgba(0, 0, 20, 0.7)',
              padding        : '18px 10px',
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
              {item.nodrop ? (
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
                  if (item[stat] > 0) {
                    return (
                      <Typography key={stat} sx={{ fontSize: '11px' }}>
                        {stat.slice(1).toUpperCase()} +{item[stat]}
                      </Typography>
                    );
                  }
                },
              )}
            </Stack>
            <Stack direction="row" spacing={1}>
              {['hp', 'mana', 'dr', 'mr', 'cr', 'fr', 'pr'].map((stat) => {
                if (item[stat] > 0) {
                  return (
                    <Typography key={stat} sx={{ fontSize: '11px' }}>
                      {stat.toUpperCase()} +{item[stat]}
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
              WT: {(item.weight / 10).toFixed(1)}
            </Typography>

            <Typography sx={{ fontSize: '11px' }}>
              Class: {getClassStringListFromClassBitmask(item.classes)}
            </Typography>
            <Typography sx={{ fontSize: '11px' }}>
              Race: {getRaceStringListFromRaceBitmask(item.races)}
            </Typography>
          </Box>
        </Box>
      }
    >
      {children}
    </Tooltip>
  );
};
