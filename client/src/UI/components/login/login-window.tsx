import React, { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { WorldSocket } from '../../net/instances';
import {
  RequiemButton,
  RequiemPanel,
  RequiemStatus,
} from '../../requiem/primitives';
import { useUIContext } from '../context';
import { refreshOfflineContent } from '@/LocalBackend/connection';
import './login-window.css';

const defaultWorldName = 'requiem';
const libraUrl = '/apps/libra/';
const sandboxUrl = '/apps/sandbox/';
declare const window: Window;
const initialQuery = new URLSearchParams(window.location.search);
const showDevHydrate = initialQuery.get('dev') === 'true';
const remoteHost =
  import.meta.env.VITE_WT_HOST?.trim() || window.location.hostname || 'localhost';
const remotePort = import.meta.env.VITE_WT_PORT?.trim() || '443';

const servers = [
  {
    name    : 'Local SQLite',
    status  : 'Ready',
    disabled: false,
    host    : 'local',
    port    : '0',
    token   : 'local',
  },
  {
    name    : 'World Shard 1 - WebTransport',
    status  : 'Development',
    disabled: false,
    host    : remoteHost,
    port    : remotePort,
    token   : 'guest',
  },
] as const;

export const LoginWindowComponent: React.FC = () => {
  const navigate = useNavigate();
  const setMode = useUIContext((state) => state.setMode);
  const token = useUIContext((state) => state.token);
  const [selectedServer, setSelectedServer] = React.useState<number>(0);
  const [connecting, setConnecting] = React.useState(false);
  const connectingRef = React.useRef(false);
  const [contentRefresh, setContentRefresh] = React.useState<{
    busy: boolean;
    message: string;
  }>({ busy: false, message: '' });

  const connectToWorld = useCallback(async () => {
    const server = servers[selectedServer];
    if (!server || server.disabled || connectingRef.current) {
      return;
    }
    connectingRef.current = true;
    setConnecting(true);
    try {
      const connected = await WorldSocket.connect(server.host, server.port, () => {
        console.log(`${server.name} disconnected`);
        navigate('/');
      });
      if (!connected) {return;}
      token.current = server.token;
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
    document.title = 'Shadows of Eltania';
  }, []);

  useEffect(() => {
    if (sessionStorage.getItem('worldLogin') === defaultWorldName) {
      connectToWorld();
      sessionStorage.removeItem('worldLogin');
    }
  }, [connectToWorld]);
  const logout = () => {
    document.cookie =
      'auth_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    localStorage.removeItem('token');
    localStorage.removeItem('requiem');
    window.location.href = '/';
  };

  return (
    <RequiemPanel
      className="rq-gateway"
      eyebrow="Elrador // Gateway"
      title="Worlds"
    >
      <div className="rq-gateway__intro">
        <p className="rq-gateway__label">Available realms</p>
        <span className="rq-gateway__count">{servers.length} discovered</span>
      </div>
      <div className="rq-gateway__realms">
        <div aria-hidden="true" className="rq-gateway__columns">
          <span>Realm</span>
          <span>Signal</span>
        </div>
        {servers.map((server, index) => (
          <button
            aria-pressed={selectedServer === index}
            className="rq-gateway__realm"
            disabled={server.disabled}
            key={server.name}
            type="button"
            onClick={() => setSelectedServer(index)}
          >
            <span>
              <span className="rq-gateway__realm-name">{server.name}</span>
              <span className="rq-gateway__realm-kind">
                {server.host === 'local' ? 'Local archive' : 'Remote shard'}
              </span>
            </span>
            <RequiemStatus
              tone={server.status === 'Ready' ? 'ready' : 'development'}
            >
              {server.status}
            </RequiemStatus>
          </button>
        ))}
      </div>

      <div className="rq-gateway__actions">
        <RequiemButton variant="quiet" onClick={logout}>
          Exit
        </RequiemButton>
        <RequiemButton
          variant="quiet"
          onClick={() => window.location.assign(libraUrl)}
        >
          Libra
        </RequiemButton>
        <RequiemButton
          variant="quiet"
          onClick={() => window.location.assign(sandboxUrl)}
        >
          Sandbox
        </RequiemButton>
        <div className="rq-gateway__actions-primary">
          <RequiemButton
            disabled={
              (servers[selectedServer]?.disabled ?? true) || connecting
            }
            variant="primary"
            onClick={connectToWorld}
          >
            {connecting ? 'Connecting…' : 'Enter realm'}
          </RequiemButton>
        </div>
      </div>

      {showDevHydrate ? (
        <div className="rq-gateway__actions">
          <RequiemButton
            disabled={contentRefresh.busy}
            variant="quiet"
            onClick={hydrateLatest}
          >
            {contentRefresh.busy ? 'Hydrating…' : 'Hydrate latest'}
          </RequiemButton>
        </div>
      ) : null}
      <p aria-live="polite" className="rq-gateway__message">
        {showDevHydrate ? contentRefresh.message : ''}
      </p>
    </RequiemPanel>
  );
};
