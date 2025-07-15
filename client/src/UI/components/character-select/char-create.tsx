import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GameManager from '@game/Manager/game-manager';
import { CharCreate, Int } from '@game/Net/internal/api/capnp/common';
import { OpCodes } from '@game/Net/opcodes';
import Player from '@game/Player/player';
import {
  Divider,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import classNames from 'classnames';
import { nameByRace } from 'fantasy-name-generator';
import {
  CharClassStrings,
  Races,
  VIEWS,
  baseClassStats,
  baseStats,
  classLookupTable,
  preferredStats,
} from '../../../Game/Constants/constants';
import {
  getAvailableDeities,
  startingCityMap,
} from '../../../Game/Constants/util';
import { UiButtonComponent } from '../../common/ui-button';
import { UiWindowComponent } from '../../common/ui-window';
import { WorldSocket } from '../../net/instances';
import { StringTable } from '../../util/string-table';
import { SupportedClasses } from './classes';
import { SupportedRaces } from './races';
import { StatRow } from './stat-row';

const selectProps = {
  size: 'small',

  MenuProps: {
    PaperProps: {
      sx: {
        color     : 'white',
        background: 'black',
        '*'       : {
          fontSize: '12px',
        },
      },
    },
  },
};

const selectSx = {
  '*': {
    borderColor: 'rgba(255, 217, 0, 0.561) !important',
    color      : 'white !important',
    fontSize   : '12px !important',
  },
  height: '35px',
  margin: '15px auto !important',
  width : '200px',
};

const statsList = [
  ['Strength', 'str'],
  ['Stamina', 'sta'],
  ['Agility', 'agi'],
  ['Dexterity', 'dex'],
  ['Wisdom', 'wis'],
  ['Intelligence', 'intel'],
  ['Charisma', 'cha'],
];

export const CharacterCreate = ({ setView, charInfo }) => {
  const [selectedRace, setSelectedRace] = useState('1');
  const [selectedClass, setSelectedClass] = useState(1);
  const [selectedDeity, setSelectedDeity] = useState(1);
  const [selectedCity, setSelectedCity] = useState(1);
  const [gender, setGender] = useState(0);
  const [face, setFace] = useState(0);
  const [name, setName] = useState('');
  const [deities, setDeities] = useState([]);
  const [startingCities, setStartingCities] = useState([]);
  const [character, setCharacter] = useState({});
  const [baseCharacter, setBaseCharacter] = useState({});
  const [initialLength] = useState(charInfo?.characters?.length);
  const [description, setDescription] = useState(CharClassStrings[1]);
  const refreshNameplate = useRef(() => {});

  const createCharacter = useCallback(() => {
    const char = {
      gender,
      face,
      name,
      tutorial : 0,
      ...character,
      race     : +selectedRace,
      charClass: selectedClass,
      startZone: selectedCity,
      deity    : selectedDeity,
    };
    console.log('Send character', char);
    WorldSocket.registerOpCodeHandler(
      OpCodes.ApproveName_Server,
      Int,
      (data) => {
        if (data.value === 1) {
          setView(VIEWS.CHAR_SELECT);
        } else {
          // alert('Invalid name');
        }
      },
    );
    WorldSocket.sendMessage(
      OpCodes.CharacterCreate,
      CharCreate,
      char,
    );
    
  }, [
    name,
    gender,
    selectedRace,
    character,
    selectedClass,
    selectedDeity,
    selectedCity,
    face,
    setView,
  ]);

  useEffect(() => {
    setFace(0);
    const deities = getAvailableDeities(+selectedRace, selectedClass);
    if (!deities.length) {
      return;
    }
    setDeities(deities);
    setSelectedDeity(deities[0][0]);
  }, [selectedRace, selectedClass]);

  useEffect(() => {
    setFace(0);
  }, [gender]);

  useEffect(() => {
    const deity = deities.find(([val]) => val === selectedDeity);
    const availableCities =
      startingCityMap[selectedClass]?.[selectedRace]?.[deity];
    if (!availableCities) {
      return;
    }
    setStartingCities(availableCities);
    setSelectedCity(availableCities[0][0]);
  }, [selectedRace, selectedClass, selectedDeity, deities]);

  useEffect(() => {
    const newCharacter = {
      charClass: selectedClass,
      race     : selectedRace,
      equip    : [],
      name     : '',
      face,
      gender,
    };

    // Check if we can keep the same class applied
    // If not, find the first available class for a new race
    if (!classLookupTable[selectedClass - 1][selectedRace - 1]) {
      for (const [idx, classEntry] of Object.entries(classLookupTable)) {
        if (classEntry[selectedRace - 1]) {
          setSelectedClass(+idx + 1);
          return;
        }
      }
    }
    GameManager.instance?.CharacterSelect?.loadModel(newCharacter, true, () => {
      refreshNameplate.current?.();
    });

    const classStats = baseClassStats[selectedClass - 1];
    const raceStats = baseStats[selectedRace - 1];
    // Initialize stats
    const char = {
      str       : classStats[0] + raceStats[0],
      sta       : classStats[1] + raceStats[1],
      agi       : classStats[2] + raceStats[2],
      dex       : classStats[3] + raceStats[3],
      wis       : classStats[4] + raceStats[4],
      intel     : classStats[5] + raceStats[5],
      cha       : classStats[6] + raceStats[6],
      statPoints: classStats[7],
      deity     : 0,
    };
    setCharacter(char);
    setBaseCharacter(char);
  }, [selectedRace, selectedClass, gender]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateStat = useCallback((stat, delta) => {
    setCharacter((char) => ({
      ...char,
      [stat]    : char[stat] + delta,
      statPoints: char.statPoints - delta,
    }));
  }, []);

  const preferredStatSet = useMemo(
    () => new Set(preferredStats[selectedClass]),
    [selectedClass],
  );

  const descriptionValue = useMemo(
    () => StringTable.getString(description),
    [description],
  );
  const statDecrement = useCallback(
    (key) => {
      updateStat(key, -1);
    },
    [updateStat],
  );
  const statIncrement = useCallback(
    (key) => {
      updateStat(key, 1);
    },
    [updateStat],
  );

  const generateName = useCallback(() => {
    const nameMap = {
      [Races.HUMAN]    : 'human',
      [Races.BARBARIAN]: 'cavePerson',
      [Races.ERUDITE]  : 'drow',
      [Races.WOODELF]  : 'elf',
      [Races.HIGHELF]  : 'highelf',
      [Races.DARKELF]  : 'darkelf',
      [Races.HALFELF]  : 'human',
      [Races.DWARF]    : 'dwarf',
      [Races.TROLL]    : 'ogre',
      [Races.OGRE]     : 'ogre',
      [Races.HALFLING] : 'halfling',
      [Races.GNOME]    : 'gnome',
    };

    let name = nameByRace(nameMap[selectedRace], {
      gender: gender === 0 ? 'male' : 'female',
    }) as string;

    name = name.replaceAll('-', '');
    name = name.toLowerCase();
    name = name[0].toUpperCase() + name.slice(1);
    name = name.split(' ')[0];
    setName(name);
  }, [selectedRace, gender]);

  useEffect(() => {
    Player.instance?.UpdateNameplate([name || 'Soandso']);
    refreshNameplate.current = () => {
      console.log('Refreshing nameplate with name', name);
      Player.instance?.UpdateNameplate([name || 'Soandso']);
    };

  }, [name]);

  const toggleFaceIdx = useCallback((val) => () => {
    setFace((prev) => (prev + val < 0 ? 0 : prev + val > 7 ? 7 : prev + val));
    if (GameManager.instance?.CharacterSelect) {
      GameManager.instance.CharacterSelect.character?.playerEntity?.setFace(
        face + val,
      );
    }
  }, [face]);

  const faceBtnFocus = useCallback(() => {
    if (GameManager.instance?.CharacterSelect) {
      GameManager.instance.CharacterSelect.faceCam = true;
    }
  }, []);
  const faceBtnBlur = useCallback(() => {
    if (GameManager.instance?.CharacterSelect) {
      GameManager.instance.CharacterSelect.faceCam = false;
    }
  }, []);

  return (
    <>
      <UiWindowComponent
        state={{
          x          : 10,
          y          : 25,
          fixed      : true,
          fixedHeight: window.innerHeight - 50,
          fixedWidth : 350,
        }}
        title="Character"
      >
        <Stack
          alignContent={'center'}
          alignItems={'center'}
          direction={'row'}
          justifyContent={'center'}
          sx={{ marginTop: '25px' }}
        >
          <UiButtonComponent
            className={classNames({ 'btn-selected': gender === 0 })}
            selected={gender === 0}
            text={'Male'}
            onClick={() => {
              setGender(0);
            }}
          />
          <Divider sx={{ margin: '5px' }} />
          <UiButtonComponent
            className={classNames({ 'btn-selected': gender === 1 })}
            selected={gender === 1}
            text={'Female'}
            onClick={() => {
              setGender(1);
            }}
          />
        </Stack>
        <Stack
          alignContent={'center'}
          alignItems={'center'}
          direction={'row'}
          justifyContent={'space-between'}
          sx={{ position: 'fixed', top: '10px', left: 'calc(50vw - 100px)', width: '200px' }}
        >
          <UiButtonComponent
            buttonName="A_LeftArrowBtn"
            isDisabled={face === 0}
            onBlur={faceBtnBlur}
            onClick={toggleFaceIdx(-1)}
            onFocus={faceBtnFocus}
          />
          <Typography sx={{
            fontSize : '15px',
            color    : 'white',
            textAlign: 'center',
          
          }}>
          Face {face + 1}

          </Typography>
          <UiButtonComponent
            buttonName="A_RightArrowBtn"
            className="face-button"
            isDisabled={face >= 6}
            onBlur={faceBtnBlur}
            onClick={toggleFaceIdx(1)}
            onFocus={faceBtnFocus}
          />
        </Stack>

        <Stack
          alignContent={'center'}
          direction={'row'}
          justifyContent={'center'}
          sx={{ marginTop: '5px' }}
        >
          {/** Races */}
          <SupportedRaces
            key={selectedRace}
            selectedRace={selectedRace}
            setDescription={setDescription}
            setSelectedRace={setSelectedRace}
          />

          {/** Classes */}
          <SupportedClasses
            selectedClass={selectedClass}
            selectedRace={selectedRace}
            setDescription={setDescription}
            setSelectedClass={setSelectedClass}
          />
        </Stack>
        <Stack direction="row" justifyContent="center" sx={{ width: '100%' }}>
          <UiButtonComponent
            scale={2}
            sx={{
              marginTop: '40px !important',
            }}
            text="Back to Character Select"
            textFontSize={'8px'}
            onClick={() => setView(VIEWS.CHAR_SELECT)}
          />
        </Stack>
      </UiWindowComponent>

      <UiWindowComponent
        state={{
          fixed      : true,
          fixedHeight: 700,
          fixedWidth : 300,
          x          : window.innerWidth - 310,
          y          : 25,
        }}
        title="Abilities"
      >
        <Stack
          alignItems={'center'}
          direction={'column'}
          justifyContent={'center'}
          sx={{ width: '100%', paddingTop: '30px' }}
        >
          <Typography noWrap component="div" sx={{ fontSize: '15px' }}>
            Points Remaining: {character.statPoints}
          </Typography>
          {statsList.map(([label, key]) => (
            <StatRow
              key={key}
              baseValue={baseCharacter[key]}
              isDisabled={character.statPoints === 0}
              isPreferred={preferredStatSet.has(key)}
              label={label}
              stat={key}
              value={character[key]}
              onDecrement={statDecrement}
              onIncrement={statIncrement}
            />
          ))}
          <Typography
            noWrap
            component="div"
            sx={{ marginTop: '15px', fontSize: '15px' }}
          >
            Deity
          </Typography>
          <Select
            value={selectedDeity}
            {...selectProps}
            sx={{ ...selectSx }}
            onChange={(e) => setSelectedDeity(e.target.value)}
          >
            {deities.map(([value, display]) => (
              <MenuItem value={value}>{display}</MenuItem>
            ))}
          </Select>

          <Typography
            noWrap
            component="div"
            sx={{ marginTop: '15px', fontSize: '15px' }}
          >
            Starting City
          </Typography>
          <Select
            value={selectedCity}
            {...selectProps}
            sx={{ ...selectSx }}
            onChange={(e) => setSelectedCity(e.target.value)}
          >
            {startingCities.map(([value, display]) => (
              <MenuItem value={value}>{display}</MenuItem>
            ))}
          </Select>

          <UiButtonComponent
            isDisabled={character.statPoints > 0 || name === ''}
            scale={1.8}
            sx={{ marginTop: '30px !important' }}
            text="Create Character"
            textFontSize="9px"
            onClick={createCharacter}
          />
        </Stack>
      </UiWindowComponent>

      <UiWindowComponent
        state={{
          fixed      : true,
          fixedHeight: 240,
          fixedWidth : 600,
          x          : window.innerWidth / 2 - 300,
          y          : window.innerHeight - 260,
        }}
      >
        <Stack
          alignContent={'center'}
          alignItems={'center'}
          direction={'row'}
          justifyContent={'space-around'}
          sx={{
            width   : '100%',
            padding : '10px',
            position: 'absolute',
            top     : '-70px',
          }}
        >
          <TextField
            autoComplete="off"
            label="Name"
            size="small"
            slotProps={{
              input: {
                sx: {
                  background: 'rgba(0,0,0,0.5) !important',
                  color     : 'white',
                },
              },
            }}
            sx={{
              width: '300px',
              color: 'white',
              '*'  : {
                borderColor: 'rgba(255, 217, 0, 0.561) !important',
                color      : 'white !important',
              },
            }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
            }}
          />
          <UiButtonComponent
            scale={1.5}
            sx={{
              marginRight: '50px',
            }}
            text="Generate Name"
            textFontSize="9px"
            onClick={generateName}
          ></UiButtonComponent>
        </Stack>
        <textarea
          readOnly
          style={{
            color     : 'white',
            height    : '200px',
            width     : 'calc(100% - 20px)',
            background: 'transparent',
            border    : 'none',
            outline   : 'none',
            margin    : '10px',
          }}
          value={descriptionValue}
        ></textarea>
      </UiWindowComponent>
    </>
  );
};
