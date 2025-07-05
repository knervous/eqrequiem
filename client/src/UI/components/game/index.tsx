import React, { useEffect, useRef } from "react";
import { Allotment } from "allotment";
import "allotment/dist/style.css";
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
import { Box } from "@mui/material";
import { StoneUIBase } from "./stone";

export const GameUIComponent: React.FC = () => {
  const [uiHidden, setUiHidden] = React.useState(false);
  const listenerRef = useRef<((event: KeyboardEvent) => void) | null>(null);

  useEffect(() => {
    if (listenerRef.current) {
      window.removeEventListener("keydown", listenerRef.current);
    }

    const keyHandler = (event: KeyboardEvent) => {
      if (event.handled) {
        return;
      }
      if (event.key === "u") {
        event.stopPropagation();
        console.log("Key 'u' pressed");
        setUiHidden((prev) => !prev);
      }
    };

    listenerRef.current = keyHandler;
    window.addEventListener("keydown", keyHandler);

    return () => {
      if (listenerRef.current) {
        window.removeEventListener("keydown", listenerRef.current);
      }
    };
  }, []);
  return (
    <Box sx={{ display: uiHidden ? 'none' : 'initial', height: '100vh', width: '100vw' }}>    
      <StoneUIBase />
      <CompassWindowComponent />

      {!inEditor && <DevWindowComponent />}

      {/* <ChatWindowsComponent />
      <ActionBarWindowsComponent />
      <TopBarWindowComponent />
      <ActionWindowComponent />
      <TargetWindowComponent />
      <PlayerWindowComponent />
      <SpellsWindowComponent /> */}
    </Box>
  );
};
