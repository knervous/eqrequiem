import React, { useState } from 'react';
import { Tab, Tabs } from '@mui/material';
import { actions } from '@ui/state/reducer';
import { useDispatch } from '../../context';
import { DevPlayer } from './dev-player';
import { DevSky } from './dev-sky';
import { NpcDeveloper } from './npc-developer';

const TabPanel: React.FC<{
  children: React.ReactNode;
  index: number;
  value: number;
}> = ({ children, value, index }) => (
  <div role="tabpanel" hidden={value !== index}>
    {value === index ? children : null}
  </div>
);

const PrimitiveGallery: React.FC = () => (
  <div className="rq-primitive-gallery">
    <section>
      <h3>Buttons</h3>
      <div className="rq-gallery-row">
        <button>Resting</button>
        <button className="is-active">Active</button>
        <button disabled>Disabled</button>
        <button className="rq-danger-button">Danger</button>
      </div>
    </section>
    <section>
      <h3>Slots</h3>
      <div className="rq-gallery-row">
        <div className="rq-item-slot" />
        <div className="rq-item-slot is-active" />
        <div className="rq-item-slot is-disabled" />
      </div>
    </section>
    <section>
      <h3>Meters</h3>
      {[
        ['health', 68],
        ['mana', 44],
        ['stamina', 83],
        ['experience', 27],
      ].map(([tone, value]) => (
        <div className={`rq-meter rq-meter--${tone}`} key={tone}>
          <div className="rq-meter__label"><span>{tone}</span><span>{value}%</span></div>
          <div className="rq-meter__track"><span style={{ width: `${value}%` }} /></div>
        </div>
      ))}
    </section>
    <section>
      <h3>Fields and tabs</h3>
      <input className="rq-gallery-input" placeholder="Field log entry…" />
      <div className="rq-tabs">
        <button aria-selected="true">Selected</button>
        <button aria-selected="false">Resting</button>
        <button disabled>Disabled</button>
      </div>
    </section>
    <section>
      <h3>Empty, loading, and error</h3>
      <div className="rq-gallery-states">
        <p className="rq-empty-state">No companions</p>
        <p className="is-loading">Reading the old marks…</p>
        <p className="is-error">The record could not be opened.</p>
      </div>
    </section>
  </div>
);

export const DevWindowComponent: React.FC = () => {
  const dispatch = useDispatch();
  const [tab, setTab] = useState(0);
  return (
    <section className="rq-dev-window rq-hud-panel">
      <header className="rq-hud-panel__header"><span>Field Instruments</span></header>
      <button
        className="rq-close"
        aria-label="Close developer tools"
        onClick={() => dispatch(actions.setWindowVisibility('devWindow', false))}
      >
        ×
      </button>
      <div className="rq-hud-panel__body">
        <Tabs value={tab} onChange={(_, value) => setTab(value)} aria-label="Developer tools">
          <Tab label="Player" />
          <Tab label="Sky" />
          <Tab label="NPC AI" />
          <Tab label="Reliquary UI" />
        </Tabs>
        <TabPanel value={tab} index={0}><DevPlayer /></TabPanel>
        <TabPanel value={tab} index={1}><DevSky /></TabPanel>
        <TabPanel value={tab} index={2}><NpcDeveloper /></TabPanel>
        <TabPanel value={tab} index={3}><PrimitiveGallery /></TabPanel>
      </div>
    </section>
  );
};
