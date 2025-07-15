import { memo } from 'react';
import { CharRaceStrings } from '@game/Constants/constants';
import RACE_DATA from '@game/Constants/race-data';
import { Stack } from '@mui/material';
import { UiButtonComponent } from '@ui/common/ui-button';
import classNames from 'classnames';

const supportedRaces = Object.entries(RACE_DATA)
  .slice(0, 12)
  .sort(([_key, race], [_key2, race2]) => (race.name > race2.name ? 1 : -1));


export const SupportedRaces = memo(({ selectedRace, setDescription, setSelectedRace }) => {
  return <Stack
    alignContent={'center'}
    direction={'column'}
    sx={{ marginTop: '5px' }}
  >
    {supportedRaces.map(([key, race]) => (
      <UiButtonComponent
        key={`char-select-race-${key}`}
        buttonName="A_BigBtn"
        className={classNames({
          'btn-selected': key === selectedRace,
        })}
        scale={1.3}
        selected={selectedRace === key}
        sx={{
          margin: '10px',
        }}
        text={race.name}
        onClick={() => {
          setDescription(CharRaceStrings[key]);
          setSelectedRace(key);
        }}
      />
    ))}
  </Stack>;
});
