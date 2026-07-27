import { useState } from 'react';
import { Tab, Tabs } from '@mui/material';
import { GmCommandDeveloper } from './gm-command-developer';
import { NpcDeveloper } from './npc-developer';

export const DevTools: React.FC = () => {
  const [tab, setTab] = useState(0);

  return (
    <div className="rq-dev-tools">
      <Tabs
        aria-label="Development tools"
        onChange={(_, value) => setTab(value)}
        value={tab}
      >
        <Tab label="NPC AI" />
        <Tab label="GM Commands" />
      </Tabs>
      <div role="tabpanel" hidden={tab !== 0}>
        {tab === 0 ? <NpcDeveloper /> : null}
      </div>
      <div role="tabpanel" hidden={tab !== 1}>
        {tab === 1 ? <GmCommandDeveloper /> : null}
      </div>
    </div>
  );
};
