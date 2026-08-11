import React, { useEffect, useRef, useState } from 'react';
import { CommandHandler } from '@game/ChatCommands/command-handler';
import { useInventoryOpen } from '@game/Events/event-hooks';
import emitter from '@game/Events/events';
import './system-toolbar.css';

export interface SystemToolbarProps {
  optionsOpen: boolean;
  onToggleOptions: () => void;
  onToggleDevTools: () => void;
  devToolsOpen?: boolean;
  children?: React.ReactNode;
}

export const SystemToolbar: React.FC<SystemToolbarProps> = ({
  optionsOpen,
  onToggleOptions,
  onToggleDevTools,
  devToolsOpen = false,
  children,
}) => {
  const inventoryOpen = useInventoryOpen();
  const [devMenuOpen, setDevMenuOpen] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(event.target as Node)) {
        setDevMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const runCommand = (cmd: () => void) => {
    cmd();
    setDevMenuOpen(false);
  };

  return (
    <div className="rq-system-toolbar-wrapper" ref={toolbarRef}>
      {/* EQ Sage Gold Border Rim Underlay */}
      <div className="rq-system-toolbar-bg" aria-hidden="true" />

      {/* Main Diagonal Docked Header Bar Background Cut */}
      <div className="rq-system-toolbar-bar" aria-hidden="true" />

      {/* Main Interactive Header Bar */}
      <nav className="rq-system-toolbar" aria-label="System Menu Bar">
        {/* Brand Badge */}
        <div className="rq-system-toolbar__brand">
          <span className="rq-system-toolbar__sigil" aria-hidden="true" />
          <span className="rq-system-toolbar__title text-outline">Eltania</span>
        </div>

        {/* Bucket 1: Character & Adventuring */}
        <div className="rq-system-toolbar__section" aria-label="Character & Adventuring">
          <span className="rq-system-toolbar__label">Character</span>
          <div className="rq-system-toolbar__group">
            <button
              className="rq-system-toolbar__button"
              aria-pressed={inventoryOpen}
              title="Toggle Character Equipment & Stats (I)"
              onClick={() => emitter.emit('toggleInventory')}
            >
              <span>Equipment</span>
              <kbd>I</kbd>
            </button>

            <button
              className="rq-system-toolbar__button"
              title="Toggle Abilities & Spells Grimoire (K)"
              onClick={() => emitter.emit('toggleAbilitiesWindow')}
            >
              <span>Abilities</span>
              <kbd>K</kbd>
            </button>

            <button
              className="rq-system-toolbar__button"
              title="Toggle Aspect Celestial Tree"
              onClick={() => emitter.emit('toggleAspectsWindow')}
            >
              <span>Aspects</span>
            </button>
          </div>
        </div>

        <span className="rq-system-toolbar__divider" aria-hidden="true" />

        {/* Bucket 2: System Settings & Dev Dropdown */}
        <div className="rq-system-toolbar__section" aria-label="System Settings">
          <span className="rq-system-toolbar__label">System</span>
          <div className="rq-system-toolbar__group">
            <button
              className="rq-system-toolbar__button"
              aria-pressed={optionsOpen}
              title="Game Options & Keybindings (F10)"
              onClick={onToggleOptions}
            >
              <span>Options</span>
              <kbd>F10</kbd>
            </button>

            {/* Dev Tools & World Clock Dropdown */}
            <div className="rq-system-toolbar__popover-wrapper">
              <button
                className="rq-system-toolbar__button"
                aria-pressed={devToolsOpen || devMenuOpen}
                aria-expanded={devMenuOpen}
                title="Developer & World Tools (F8)"
                onClick={() => setDevMenuOpen((prev) => !prev)}
              >
                <span>Dev Tools ▾</span>
                <kbd>F8</kbd>
              </button>
              {devMenuOpen ? (
                <div className="rq-system-toolbar__popover rq-system-toolbar__popover--dev" role="menu">
                  {children ? (
                    <div className="rq-system-toolbar__dev-widget">
                      <span className="rq-system-toolbar__dev-header">World Time Scrubber</span>
                      {children}
                    </div>
                  ) : null}
                  <div className="rq-system-toolbar__popover-divider" />
                  <button onClick={() => runCommand(onToggleDevTools)}>
                    <span>Developer Window</span>
                    <kbd>F8</kbd>
                  </button>
                </div>
              ) : null}
            </div>

            <button
              className="rq-system-toolbar__button rq-system-toolbar__button--danger"
              title="Camp / Character Select (/camp)"
              onClick={() => CommandHandler.instance().commandCamp()}
            >
              <span>Camp</span>
            </button>
          </div>
        </div>
      </nav>
    </div>
  );
};
