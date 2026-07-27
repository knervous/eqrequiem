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
import { Int, String } from '@game/Net/messages';
import {
  CharacterSelect,
  CharacterSelectEntry,
} from '@game/Net/messages';
import {
  EnterWorld,
  JWTLogin,
  JWTResponse,
} from '@game/Net/messages';
import {
  RequestClientZoneChange,
  ZoneChangeType,
  ZoneSession,
} from '@game/Net/messages';
import { OpCodes } from '@game/Net/opcodes';
import { Box } from '@mui/material';
import { useDebouncedCallback } from 'use-debounce';
import { VIEWS } from '../../../Game/Constants/constants';
import { WorldSocket } from '../../net/instances';
import {
  RequiemButton,
  RequiemPanel,
} from '../../requiem/primitives';
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
    document.title = 'Shadows of Eltania';
    MusicPlayer.play('character-select');
  }, []);

  const enterWorld = useDebouncedCallback(() => {
    if (!selectedChar) {
      return;
    }
    GameManager.instance.CharacterSelect?.dispose();

    WorldSocket.registerOpCodeHandler(OpCodes.ZoneSessionValid, Int, (data) => {
      console.log('Zone session valid:', data);
      if (data.value === 1) {
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
        <RequiemPanel
          className="rq-character-roster"
          eyebrow="Elrador // Characters"
          title="Characters"
        >
          <div className="rq-character-roster__list">
            {charInfo?.characters.map((c) => (
              <button
                aria-pressed={selectedChar?.name === c?.name}
                className="rq-character-roster__entry"
                key={`char-${c.name}`}
                type="button"
                onClick={() => {
                  setSelectedChar(c);
                }}
              >
                <span>{c.name}</span>
                <span>
                  Level {c.level}{' '}
                  {c.callingId === 'calling:eltania-vanguard-v1'
                    ? 'vanguard'
                    : 'wayfarer'}
                </span>
              </button>
            ))}
            {Array.from({ length: charSelectNum }, (_, idx) => (
              <button
                className="rq-character-roster__entry rq-character-roster__entry--empty"
                key={`char-create-${idx}`}
                type="button"
                onClick={() => {
                  setView(VIEWS.CHAR_CREATE);
                }}
              >
                <span>Create character</span>
                <span>Empty slot</span>
              </button>
            ))}
          </div>
          <div className="rq-character-roster__actions">
              <RequiemButton
                variant="quiet"
                onClick={() => {
                  setMode('login');
                  GameManager.instance.dispose();
                  WorldSocket.close();
                }}
              >
                Back
              </RequiemButton>
              <RequiemButton
                disabled={!selectedChar}
                variant="quiet"
                onClick={() => {
                  if (!selectedChar) {
                    return;
                  }
                  WorldSocket.sendMessage(OpCodes.DeleteCharacter, String, {
                    value: selectedChar.name,
                  });
                }}
              >
                Delete
              </RequiemButton>
            <RequiemButton
              disabled={!selectedChar || charSelectNum === 8}
              variant="primary"
              onClick={enterWorld}
            >
              Enter Elrador
            </RequiemButton>
          </div>
        </RequiemPanel>
      ) : (
        <CharacterCreate setView={setView} />
      )}
    </Box>
  );
};
