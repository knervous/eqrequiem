import { memo } from 'react';
import { CLASS_DATA_NAMES } from '@game/Constants/class-data';
import { CharClassStrings, classLookupTable } from '@game/Constants/constants';
import { Stack } from '@mui/material';
import { UiButtonComponent } from '@ui/common/ui-button';
import classNames from 'classnames';

const supportedClasses = Object.entries(CLASS_DATA_NAMES)
  .slice(0, 14)
  .sort(([, name], [, name2]) => (name > name2 ? 1 : -1));

export const SupportedClasses = memo(
  ({ selectedClass, setDescription, setSelectedClass, selectedRace }) => {
    return (
      <Stack
        alignContent={'center'}
        direction={'column'}
        justifyContent={'center'}
        sx={{ marginTop: '5px', marginLeft: '15px' }}
      >
        {supportedClasses.map(([id, name]) => (
          <UiButtonComponent
            buttonName="A_BigBtn"
            className={classNames({
              'btn-selected': +id === selectedClass,
            })}
            isDisabled={!classLookupTable[id - 1][selectedRace - 1]}
            scale={1.2}
            selected={selectedClass === +id}
            sx={{
              margin: '10px',
            }}
            text={name}
            onClick={() => {
              setDescription(CharClassStrings[+id]);
              setSelectedClass(+id);
            }}
          />
        ))}
      </Stack>
    );
  },
);
