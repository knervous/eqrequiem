import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { UserConfig } from '@game/Config/config';
import { CLASS_DATA_NAMES } from '@game/Constants/class-data';
import { supportedZones } from '@game/Constants/supportedZones';
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

  const selectedClass = selectedChar
    ? CLASS_DATA_NAMES[selectedChar.charClass as keyof typeof CLASS_DATA_NAMES] ??
      'Wayfarer'
    : 'Wayfarer';
  const selectedZone = selectedChar
    ? supportedZones[(selectedChar.zone ?? '').toString()]?.longName ?? 'Eltania'
    : 'Eltania';

  return !gotCharInfo.current ? null : (
    <Box className="char-select">
      {view === VIEWS.CHAR_SELECT ? (
        <div className="rq-character-select-shell">
          <header className="rq-character-select-brand">
            <span className="rq-character-select-brand__mark" aria-hidden="true" />
            <div>
              <p>Shadows of Eltania</p>
              <span>Wayfarer&apos;s Verge</span>
            </div>
          </header>

          <aside className="rq-character-roster" aria-label="Character roster">
            <header className="rq-character-roster__header">
              <p>Choose your wayfarer</p>
              <h1>Return to Eltania</h1>
              <span>
                {charInfo?.characterCount ?? 0} of 8 journeys bound
              </span>
            </header>

            <div className="rq-character-roster__list">
              {charInfo?.characters.map((character) => {
                const className =
                  CLASS_DATA_NAMES[
                    character.charClass as keyof typeof CLASS_DATA_NAMES
                  ] ?? 'Wayfarer';
                const zoneName =
                  supportedZones[(character.zone ?? '').toString()]?.longName ??
                  'Eltania';
                return (
                  <button
                    aria-pressed={selectedChar?.name === character.name}
                    className="rq-character-roster__entry"
                    key={`char-${character.name}`}
                    type="button"
                    onClick={() => setSelectedChar(character)}
                  >
                    <span className="rq-character-roster__sigil" aria-hidden="true">
                      {character.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="rq-character-roster__identity">
                      <strong>{character.name}</strong>
                      <small>Level {character.level} {className}</small>
                    </span>
                    <span className="rq-character-roster__place">{zoneName}</span>
                  </button>
                );
              })}

              {charSelectNum > 0 ? (
                <button
                  className="rq-character-roster__create"
                  type="button"
                  onClick={() => setView(VIEWS.CHAR_CREATE)}
                >
                  <span aria-hidden="true">+</span>
                  <span>
                    <strong>Create a new wayfarer</strong>
                    <small>{charSelectNum} {charSelectNum === 1 ? 'slot' : 'slots'} available</small>
                  </span>
                </button>
              ) : null}
            </div>

            <section className="rq-character-roster__selection" aria-live="polite">
              <div>
                <span>Selected</span>
                <strong>{selectedChar?.name ?? 'No character'}</strong>
              </div>
              <dl>
                <div>
                  <dt>Calling</dt>
                  <dd>{selectedClass}</dd>
                </div>
                <div>
                  <dt>Last camp</dt>
                  <dd>{selectedZone}</dd>
                </div>
              </dl>
            </section>

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
                  if (!selectedChar) return;
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
                Enter Eltania
              </RequiemButton>
            </div>

            <p className="rq-character-roster__hint">
              Enter to continue <span aria-hidden="true">·</span> Esc to return
            </p>
          </aside>
        </div>
      ) : (
        <CharacterCreate setView={setView} />
      )}
    </Box>
  );
};
