import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { UserConfig } from '@game/Config/config';
import GameManager from '@game/Manager/game-manager';
import { MusicPlayer } from '@game/Music/music-player';
import { Int, String } from '@game/Net/internal/api/capnp/common';
import {
  CharacterSelect,
  CharacterSelectEntry,
} from '@game/Net/internal/api/capnp/player';
import {
  EnterWorld,
  JWTLogin,
  JWTResponse,
} from '@game/Net/internal/api/capnp/world';
import {
  RequestClientZoneChange,
  ZoneChangeType,
  ZoneSession,
} from '@game/Net/internal/api/capnp/zone';
import { OpCodes } from '@game/Net/opcodes';
import { Box, Stack } from '@mui/material';
import { useDebouncedCallback } from 'use-debounce';
import { VIEWS } from '../../../Game/Constants/constants';
import { UiButtonComponent } from '../../common/ui-button';
import { UiWindowComponent } from '../../common/ui-window';
import { WorldSocket } from '../../net/instances';
import { useUIContext } from '../context';
import { CharacterCreate } from './char-create';
import './component.css';



export const CharacterSelectUIComponent: React.FC = () => {
  const setMode = useUIContext((state) => state.setMode);
  const token = useUIContext((state) => state.token);
  const [view, setView] = useState(VIEWS.CHAR_SELECT);
  const setSplash = globalThis.setSplash;
  const [charInfo, setCharInfo] = React.useState<CharacterSelect | null>(null);
  const gotCharInfo = useRef(false);
  const [selectedChar, setSelectedChar] =
    React.useState<CharacterSelectEntry | null>(null);

  const charSelectHandler = useCallback(
    async (serverCharInfo: CharacterSelect) => {
      if (!gotCharInfo.current) {
        await GameManager.instance.loadCharacterSelect();
      }
      gotCharInfo.current = true;
      setCharInfo(serverCharInfo);
      setSelectedChar(
        serverCharInfo.characterCount > 0
          ? serverCharInfo.characters[0]
          : ({
            race     : 1,
            charClass: 1,
            name     : 'Soandso',
            level    : 1,
            face     : 1,
          } as CharacterSelectEntry),
      );
    },
    [],
  );

  useEffect(() => {
    document.title = 'EQ: Requiem';
    MusicPlayer.play('character-select');
  }, []);

  const enterWorld = useDebouncedCallback(() => {
    if (!selectedChar) {
      return;
    }
    GameManager.instance.CharacterSelect?.dispose();

    WorldSocket.registerOpCodeHandler(OpCodes.ZoneSessionValid, Int, (data) => {
      console.log('Zone session valid:', data);
      if (data) {
        WorldSocket.sendMessage(
          OpCodes.RequestClientZoneChange,
          RequestClientZoneChange,
          {
            type: ZoneChangeType.FROM_WORLD, // Type 0 is zone in from world
          },
        );
      } else {
        // alert('Could not enter world');
      }
    });
    WorldSocket.registerOpCodeHandler(OpCodes.PostEnterWorld, Int, async (data) => {
      if (data.value === 1) {
        await UserConfig.instance.initialize('requiem', selectedChar.name);
        WorldSocket.sendMessage(OpCodes.ZoneSession, ZoneSession, {
          zoneId    : selectedChar.zone,
          instanceId: 0,
        });
      } else {
        //  alert('Could not enter world');
      }
    });
    console.log('Sending enter world');
    WorldSocket.sendMessage(OpCodes.EnterWorld, EnterWorld, {
      name      : selectedChar.name,
      tutorial  : 0,
      returnHome: 0,
    });
  }, 100);

  useEffect(() => {
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMode('login');
        GameManager.instance.dispose();
        WorldSocket.close();
      } else if (e.key === 'Enter') {
        enterWorld();
      }
    };
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('keydown', keyHandler);
    };
  }, [selectedChar, setMode, view, enterWorld]);

  useEffect(() => {
    if (!token?.current) {
      return;
    }
    setSplash?.(true);
    setTimeout(() => {
      setSplash?.(false);
    }, 1000);
    WorldSocket.registerOpCodeHandler<CharacterSelect>(
      OpCodes.SendCharInfo,
      CharacterSelect,
      charSelectHandler,
    );
    console.log('Sending token');
    WorldSocket.registerOpCodeHandler<JWTResponse>(
      OpCodes.JWTResponse,
      JWTResponse,
      (e) => {
        if (!e.status) {
          // alert('Could not login to server');
          setMode('login');
          GameManager.instance.dispose();
          WorldSocket.close();
        } else if (e.status === -100) {
          localStorage.removeItem('requiem');
          // alert('Your session has expired, please login again.');
          setMode('login');
          GameManager.instance.dispose();
        } else {
          WorldSocket.setSessionId(e.status);
        }
        console.log('JWT Response', e.status);
      },
    );

    WorldSocket.sendMessage(OpCodes.JWTLogin, JWTLogin, {
      token: token.current,
    });
  }, [setMode, charSelectHandler, token, setSplash]);
  const charSelectNum = useMemo(() => {
    return 8 - (charInfo?.characterCount ?? 0);
  }, [charInfo?.characterCount]);

  const debouncedLoad = useDebouncedCallback(() => {
    if (view === VIEWS.CHAR_CREATE) {
      return;
    }
    const char =
      selectedChar ||
      ({
        name     : 'Soandso',
        gender   : 0,
        charClass: 0,
        race     : 1,
        level    : 1,
        face     : 1,
      } as CharacterSelectEntry);
    GameManager.instance.CharacterSelect?.loadModel(char);
  }, 250);

  useEffect(debouncedLoad, [selectedChar, view, debouncedLoad]);

  return !gotCharInfo.current ? null : (
    <Box className="char-select">
      {view === VIEWS.CHAR_SELECT ? (
        <UiWindowComponent
          background="TrackingBG_TX"
          state={{
            fixed      : true,
            x          : 30,
            y          : 30,
            fixedHeight: 600,
            fixedWidth : 250,
          }}
          title="Characters"
          windowName={'charSelect'}
        >
          <Stack
            alignItems={'center'}
            sx={{ padding: '20px', paddingTop: '30px', height: '100%' }}
          >
            {charInfo?.characters.map((c) => (
              <UiButtonComponent
                key={`char-${c.name}`}
                buttonName="A_BigBtn"
                scale={1.5}
                selected={selectedChar?.name === c?.name}
                sx={{ margin: '12px' }}
                text={c.name}
                textFontSize="9px"
                onClick={() => {
                  setSelectedChar(c);
                }}
              />
            ))}
            {Array.from({ length: charSelectNum }, (_, idx) => (
              <UiButtonComponent
                key={`char-create-${idx}`}
                buttonName="A_BigBtn"
                scale={1.5}
                sx={{ margin: '12px' }}
                text={'Create New Character'}
                textFontSize="9px"
                onClick={() => {
                  setView(VIEWS.CHAR_CREATE);
                }}
              />
            ))}

            <Stack direction={'row'} sx={{ marginTop: '25px' }}>
              <UiButtonComponent
                buttonName="A_SmallBtn"
                scale={1.3}
                sx={{ margin: '12px' }}
                text={'Back'}
                textFontSize="11px"
                onClick={() => {
                  setMode('login');
                  GameManager.instance.dispose();
                  WorldSocket.close();
                }}
              />
              <UiButtonComponent
                buttonName="A_SmallBtn"
                isDisabled={!selectedChar}
                scale={1.3}
                sx={{ margin: '12px' }}
                text={'Delete'}
                textFontSize="11px"
                onClick={() => {
                  if (!selectedChar) {
                    return;
                  }
                  WorldSocket.sendMessage(OpCodes.DeleteCharacter, String, {
                    value: selectedChar.name,
                  });
                }}
              />
            </Stack>
            <UiButtonComponent
              buttonName="A_BigBtn"
              isDisabled={!selectedChar || charSelectNum === 8}
              scale={1.5}
              sx={{ margin: '12px' }}
              text={'Enter World'}
              textFontSize="9px"
              onClick={enterWorld}
            />
          </Stack>
        </UiWindowComponent>
      ) : (
        <CharacterCreate charInfo={charInfo} setView={setView} />
      )}
    </Box>
  );
};
