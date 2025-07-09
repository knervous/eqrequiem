import React, { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { SxProps } from '@mui/material';
import Box from '@mui/material/Box';
import { UiState, initialUiState } from '../state/initial-state';
import { uiReducer } from '../state/reducer';
import { StringTable } from '../util/string-table';
import { CharacterSelectUIComponent } from './character-select';
import { UIContext } from './context';
import { GameUIComponent } from './game';
import { LoginUIComponent } from './login';
import { stateKey } from './overlay-types';
import { Theme } from './theme';
import { fsBindings } from '@/Core/bindings';
import './overlay.css';
import { ZonePacketHandler } from '@game/Net/zone-packets';
import emitter from '@game/Events/events';
import { useEvent } from '@game/Events/event-hooks';


let storedState: UiState | string | null = localStorage.getItem(stateKey);
if (storedState) {
  try {
    storedState = JSON.parse(storedState);
    storedState = { ...initialUiState, ...(storedState as object)! };
  } catch (e) {
    console.error('Failed to parse stored state', e);
    storedState = null;
  }

  storedState = initialUiState;
}
type Props = {
  sx?: SxProps;
};

export const Overlay: React.FC<Props> = (props: Props) => {
  const [mode, setMode] = React.useState<string>('login');
  const token = useRef<string | null>('');
  const [uiState, dispatcher] = useReducer(
    uiReducer,
    (storedState as UiState | null) ?? initialUiState,
  );

  useEvent('setMode', useCallback((newMode: string) => {
    setMode(newMode);
  }, []));


  useEffect(() => {
    if (mode === 'game') {
      emitter.emit('chatMessage', { chanNum: 0, type: 0, message: 'Welcome to EQ Requiem!', color: '#ddd' });
      emitter.emit('chatMessage', { chanNum: 0, type: 0, message: 'This is currently a demo sandbox with development features.', color: '#ddd' });
      emitter.emit('chatMessage', { chanNum: 0, type: 0, message: 'Type /help to get started.', color: '#ddd' });
    }

  }, [mode]);

  useEffect(() => {
    try {
      localStorage.setItem(
        stateKey,
        JSON.stringify({ ...initialUiState, ...uiState }),
      );
    } catch (e) {
      console.error('Failed to save state', e);
    }
  }, [uiState]);

  useEffect(() => {
    StringTable.initialize();
  }, []);

  const component = useMemo(() => {
    switch (mode) {
      case 'character-select':
        return <CharacterSelectUIComponent />;
      case 'game':
        return <GameUIComponent />;
      default:
      case 'login':
        return <LoginUIComponent />;
    }
  }, [mode]);
  return (
    <UIContext.Provider
      value={{
        getEQFile: fsBindings.getFile,
        ui       : uiState,
        dispatcher,
        mode,
        setMode,
        token,
      }}
    >
      <Theme>
        <Box
          className="requiem-ui"
          id="requiem-ui"
          sx={{
            width : '100%',
            height: '100%',
            ...(props.sx ?? {}),
          }}
        >
          {component}
        </Box>
      </Theme>
    </UIContext.Provider>
  );
};

export default Overlay;
