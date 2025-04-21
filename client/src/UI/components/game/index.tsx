import React from "react";
import { ChatWindowsComponent } from "./chat/chat-windows";
import { ActionBarWindowsComponent } from "./actionbar/action-bar-windows";
import { TopBarWindowComponent } from "./topbar/topbar-window";
import { CompassWindowComponent } from "./topbar/compass-window";
import { ActionWindowComponent } from "./actions/actions-window";
import { TargetWindowComponent } from "./target/target-window";
import { PlayerWindowComponent } from "./player/player-window";
import { SpellsWindowComponent } from "./spells/spells-window";
import { inEditor } from "../../util/constants";
import { DevWindowComponent } from "./dev/dev-window";

export const GameUIComponent: React.FC = () => {
  return (
    <>
      <ChatWindowsComponent />
      <ActionBarWindowsComponent />
      <TopBarWindowComponent />
      <CompassWindowComponent />
      <ActionWindowComponent />
      <TargetWindowComponent />
      <PlayerWindowComponent />
      <SpellsWindowComponent />
      {!inEditor && <DevWindowComponent />}
    </>
  );
};
