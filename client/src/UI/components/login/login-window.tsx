import React, { useCallback, useEffect } from 'react';
import { Box, List, ListItem, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { UiButtonComponent } from '../../common/ui-button';
import { WorldSocket } from '../../net/instances';
import { ImageCache } from '../../util/image-cache';
import { useUIContext } from '../context';
import { refreshOfflineContent } from '@/LocalBackend/connection';

const defaultWorldName = 'requiem';
const libraUrl = '/apps/libra/';
const sandboxUrl = '/apps/sandbox/';
declare const window: Window;
const initialQuery = new URLSearchParams(window.location.search);
const showDevHydrate = initialQuery.get('dev') === 'true';

const servers = [
  { name: 'Local SQLite', status: 'Ready', disabled: false },
  {
    name    : 'World Shard 1 - In development (offline)',
    status  : 'Offline',
    disabled: true,
  },
] as const;

export const LoginWindowComponent: React.FC = () => {
  const navigate = useNavigate();
  const setMode = useUIContext((state) => state.setMode);
  const token = useUIContext((state) => state.token);
  const [imageTiles, setImageTiles] = React.useState<string[]>([]);
  const [selectedServer, setSelectedServer] = React.useState<number>(0);
  const [connecting, setConnecting] = React.useState(false);
  const connectingRef = React.useRef(false);
  const [contentRefresh, setContentRefresh] = React.useState<{
    busy: boolean;
    message: string;
  }>({ busy: false, message: '' });

  const connectToWorld = useCallback(async () => {
    if (servers[selectedServer]?.disabled || connectingRef.current) {
      return;
    }
    connectingRef.current = true;
    setConnecting(true);
    try {
      const connected = await WorldSocket.connect('local', 0, () => {
        console.log('Local SQLite backend disconnected');
        navigate('/');
      });
      if (!connected) {return;}
      token.current = 'local';
      setMode('character-select');
    } finally {
      connectingRef.current = false;
      setConnecting(false);
    }
  }, [navigate, selectedServer, setMode, token]);

  const hydrateLatest = useCallback(async () => {
    setContentRefresh({ busy: true, message: 'Replacing local content…' });
    try {
      const info = await refreshOfflineContent();
      setContentRefresh({
        busy   : false,
        message: `Content ${info.contentVersion} ready; local characters preserved.`,
      });
    } catch (error) {
      setContentRefresh({
        busy   : false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  useEffect(() => {
    const kbCallback = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        navigate('/');
      }
      if (e.key === 'Enter') {
        if (selectedServer >= 0 && selectedServer < servers.length) {
          connectToWorld();
        }
      }
    };
    window.addEventListener('keydown', kbCallback);
    return () => {
      window.removeEventListener('keydown', kbCallback);
    };
  }, [navigate, connectToWorld, selectedServer]);

  useEffect(() => {
    Promise.all(
      Array.from({ length: 6 }).map((_, i) => {
        return ImageCache.getImageUrl(
          'uifiles/default',
          `EQLS_WndBorder_0${i + 1}.webp`,
        );
      }),
    ).then(setImageTiles);
    document.title = 'EQ: Requiem';
  }, []);

  useEffect(() => {
    if (sessionStorage.getItem('worldLogin') === defaultWorldName) {
      connectToWorld();
      sessionStorage.removeItem('worldLogin');
    }
  }, [connectToWorld]);
  return (
    <Box
      sx={{
        position           : 'relative',
        width              : '634px', // 3 tiles wide
        height             : '450px', // 2 tiles tall
        display            : 'grid',
        gridTemplateRows   : '1fr 1fr', // 2 rows
        gridTemplateColumns: '1fr 1fr 1fr', // 3 columns
        boxShadow          : '0 0 25px 10px #000000', // Wide black shadow
        gridGap            : '0px', // No gap between tiles
        '*'                : {
          fontFamily: 'Arial, sans-serif !important',
        },
      }}
    >
      {/* Background Image Tiles */}
      {imageTiles.length === 6 && (
        <>
          {/* Row 1 */}
          <Box
            sx={{
              background: `url(${imageTiles[0]}) no-repeat`,
              width     : '256px',
            }}
          />
          <Box
            sx={{
              background: `url(${imageTiles[1]}) no-repeat`,
              width     : '256px',
              marginLeft: '-2px',
            }}
          />
          <Box
            sx={{
              background: `url(${imageTiles[2]}) no-repeat`,
              width     : '128px',
              marginLeft: '-4px',
            }}
          />
          {/* Row 2 */}
          <Box
            sx={{
              background: `url(${imageTiles[3]}) no-repeat`,
              width     : '256px',
            }}
          />
          <Box
            sx={{
              background: `url(${imageTiles[4]}) no-repeat`,
              width     : '256px',
              marginLeft: '-2px',
            }}
          />
          <Box
            sx={{
              background: `url(${imageTiles[5]}) no-repeat`,
              width     : '128px',
              marginLeft: '-4px',
            }}
          />
        </>
      )}

      {/* Login Content Overlay */}
      <Box
        sx={{
          position : 'absolute',
          width    : '100%',
          padding  : '0px 20px',
          textAlign: 'center',
          overflow : 'hidden',
        }}
      >
        <Typography
          sx={{
            width    : '100%',
            color    : 'gold',
            fontSize : '17px',
            marginTop: '15px',
          }}
          variant="h6"
        >
          Server Select
        </Typography>
        <Box
          sx={{
            width     : 'calc(100% - 75px)',
            height    : '252px',
            marginTop : '35px',
            marginLeft: '20px',
            background                  :
              'linear-gradient(180deg, rgba(20, 20, 20, 0.9) 0%, rgba(10, 10, 10, 0.9) 100%)', // Dark gradient
            border                      : '1px solid #333', // Subtle border
            overflowY                   : 'scroll',
            '&::-webkit-scrollbar'      : { width: '4px' },
            '&::-webkit-scrollbar-thumb': { backgroundColor: '#555' },
          }}
        >
          {/* Header Row */}
          <Box
            sx={{
              display            : 'grid',
              gridTemplateColumns: '2fr 1fr', // Server name takes more space
              backgroundColor    : 'rgba(0, 0, 0, 0.8)',
              padding            : '8px',
              borderBottom       : '1px solid #444',
              position           : 'sticky',
              top                : 0,
              zIndex             : 1,
            }}
          >
            <Typography
              sx={{ fontSize: '14px', color: '#ddd', fontWeight: 'bold' }}
            >
              Server
            </Typography>
            <Typography
              sx={{ fontSize: '14px', color: '#ddd', fontWeight: 'bold' }}
            >
              Status
            </Typography>
          </Box>

          {/* Server List */}
          <List sx={{ padding: 0 }}>
            {servers.map((server, index) => (
              <ListItem
                key={index}
                sx={{
                  display            : 'grid',
                  gridTemplateColumns: '2fr 1fr',
                  padding            : '8px',
                  cursor             : server.disabled ? 'not-allowed' : 'pointer',
                  opacity            : server.disabled ? 0.55 : 1,
                  backgroundColor:
                    selectedServer === index
                      ? 'rgba(255, 215, 0, 0.2)'
                      : 'transparent', // Gold highlight for selected
                  '&:hover': {
                    backgroundColor: 'rgba(255, 255, 255, 0.1)', // Hover effect
                  },
                  borderBottom: '1px solid #222',
                }}
                onClick={() => setSelectedServer(index)}
              >
                <Typography sx={{ fontSize: '14px', color: '#fff' }}>
                  {server.name}
                </Typography>
                <Typography
                  sx={{ fontSize: '14px', color: '#fff', textAlign: 'center' }}
                >
                  {server.status}
                </Typography>
              </ListItem>
            ))}
          </List>
        </Box>

        {/* Buttons */}
        <Stack
          direction="row"
          spacing={3}
          sx={{
            margin        : '13px auto',
            width         : '80%',
            alignContent  : 'center',
            alignItems    : 'center',
            justifyContent: 'space-around',
          }}
        >
          <UiButtonComponent
            buttonName="A_EQLS_LargeBtn"
            text={'Logout'}
            textSx={{
              color: 'white !important',
            }}
            onClick={() => {
              document.cookie =
                'auth_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
              localStorage.removeItem('token');
              localStorage.removeItem('requiem');
              window.location.href = '/';
            }}
          />

          <UiButtonComponent
            buttonName="A_EQLS_LargeBtn"
            isDisabled={(servers[selectedServer]?.disabled ?? true) || connecting}
            text={connecting ? 'Connecting…' : 'Play'}
            textSx={{
              color: 'white !important',
            }}
            onClick={connectToWorld}
          />
        </Stack>

        <Stack
          direction="row"
          spacing={3}
          sx={{
            margin        : '-3px auto 12px',
            width         : '80%',
            alignContent  : 'center',
            alignItems    : 'center',
            justifyContent: 'space-around',
          }}
        >
          <UiButtonComponent
            buttonName="A_EQLS_LargeBtn"
            text="Libra"
            textSx={{
              color: 'white !important',
            }}
            onClick={() => window.location.assign(libraUrl)}
          />

          <UiButtonComponent
            buttonName="A_EQLS_LargeBtn"
            text="Sandbox"
            textSx={{
              color: 'white !important',
            }}
            onClick={() => window.location.assign(sandboxUrl)}
          />
        </Stack>
        {showDevHydrate ? (
          <Stack alignItems="flex-end" direction="row" justifyContent="flex-end" spacing={1} sx={{ marginRight: '60px', marginTop: '-10px' }}>
            <UiButtonComponent
              buttonName="A_EQLS_LargeBtn"
              isDisabled={contentRefresh.busy}
              text={contentRefresh.busy ? 'Hydrating…' : 'Hydrate Latest'}
              textSx={{ color: 'white !important' }}
              onClick={hydrateLatest}
            />
          </Stack>
        ) : null}
        {showDevHydrate && contentRefresh.message ? (
          <Typography sx={{ color: '#ddd', fontSize: '11px', marginTop: '4px', textAlign: 'right', marginRight: '60px' }}>
            {contentRefresh.message}
          </Typography>
        ) : null}
      </Box>
    </Box>
  );
};
