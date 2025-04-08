import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useUIContext } from "../context";
import * as EQMessage from "../../../../game/Code/Net/message/EQMessage";
import { WorldSocket } from "../../net/instances";
import { Box, Stack } from "@mui/material";
import { MainInvoker } from "../../state/bridge";
import { UiWindowComponent } from "../../common/ui-window";
import { UiButtonComponent } from "../../common/ui-button";
import { VIEWS } from "../../../../game/Code/Constants/constants";
import { CharacterCreate } from "./char-create";

import "./component.css";

let splashed = false;

export const CharacterSelectUIComponent: React.FC = () => {
  const setMode = useUIContext((state) => state.setMode);
  const token = useUIContext((state) => state.token);
  const [view, setView] = useState(VIEWS.CHAR_SELECT);
  const setSplash = window.setSplash;
  const [charInfo, setCharInfo] =
    React.useState<EQMessage.CharacterSelect | null>(null);
  const [gotCharInfo, setGotCharInfo] = React.useState(false);
  const [selectedChar, setSelectedChar] =
    React.useState<EQMessage.CharacterSelectEntry | null>(null);

  const charSelectHandler = useCallback(
    (charInfo: EQMessage.CharacterSelect) => {
      setGotCharInfo(true);
      setCharInfo(charInfo);
      setSelectedChar(charInfo?.characters[0] ?? null);
      if (!splashed) {
        setSplash?.(true);
      
        setTimeout(() => {
          setSplash?.(false);
        }, 1000);
        splashed  = true;
      }
      
    },
    [setSplash],
  );

  useEffect(() => {
    if (!token?.current) {
      return;
    }
    MainInvoker.current?.({ type: "loadCharacterSelect" });
    WorldSocket.registerOpCodeHandler<EQMessage.CharacterSelect>(
      EQMessage.OpCodes.OP_SendCharInfo,
      EQMessage.CharacterSelect,
      charSelectHandler,
    );
    WorldSocket.sendMessage(EQMessage.OpCodes.OP_JWTLogin, EQMessage.JWTLogin, {
      token: token.current,
    });
  }, [setMode, charSelectHandler, token, setSplash]);

  const charSelectNum = useMemo(() => {
    return 8 - (charInfo?.characterCount ?? 0);
  }, [charInfo?.characterCount]);

  useEffect(() => {
    if (!gotCharInfo || view === VIEWS.CHAR_CREATE) {
      return;
    }
    MainInvoker.current?.({
      type: "characterSelectPlayer",
      payload: { player: selectedChar },
    });
  }, [selectedChar, gotCharInfo, view]);

  return !gotCharInfo ? null : (
    <Box className="char-select">
      {view === VIEWS.CHAR_SELECT ? (
        <UiWindowComponent
          title="Characters"
          state={{
            fixed: true,
            x: 30,
            y: 30,
            fixedHeight: 600,
            fixedWidth: 250,
          }}
          windowName={"charSelect"}
        >
          <Stack
            sx={{ padding: "20px", paddingTop: "30px", height: "100%" }}
            alignItems={"center"}
          >
            {charInfo?.characters.map((c) => (
              <UiButtonComponent
                selected={selectedChar === c}
                buttonName="A_BigBtn"
                text={c.name}
                scale={1.5}
                textFontSize="9px"
                sx={{ margin: "12px" }}
                onClick={() => {
                  setSelectedChar(c);
                }}
                key={`char-${c.name}`}
              />
            ))}
            {Array.from({ length: charSelectNum }, (_, idx) => (
              <UiButtonComponent
                buttonName="A_BigBtn"
                text={"Create New Character"}
                textFontSize="9px"
                scale={1.5}
                sx={{ margin: "12px" }}
                onClick={() => {
                  setView(VIEWS.CHAR_CREATE);
                }}
                key={`char-create-${idx}`}
              />
            ))}

            <Stack sx={{ marginTop: "25px" }} direction={"row"}>
              <UiButtonComponent
                buttonName="A_SmallBtn"
                text={"Back"}
                scale={1.3}
                textFontSize="11px"
                sx={{ margin: "12px" }}
                onClick={() => {
                  setMode("login");
                  MainInvoker.current?.({ type: "dispose" });
                  WorldSocket.close();
                }}
              />
              <UiButtonComponent
                buttonName="A_SmallBtn"
                text={"Delete"}
                disabled={!selectedChar}
                scale={1.3}
                textFontSize="11px"
                sx={{ margin: "12px" }}
                onClick={() => {
                  if (!selectedChar) {
                    return;
                  }
                  WorldSocket.sendMessage(
                    EQMessage.OpCodes.OP_DeleteCharacter,
                    EQMessage.String$,
                    { value: selectedChar.name },
                  );
                }}
              />
            </Stack>
            <UiButtonComponent
              buttonName="A_BigBtn"
              text={"Enter World"}
              disabled={!selectedChar}
              scale={1.5}
              textFontSize="9px"
              sx={{ margin: "12px" }}
              onClick={() => {
                setMode("game");
                MainInvoker.current?.({
                  type: "loadZone",
                  payload: selectedChar?.zone,
                });
                MainInvoker.current?.({
                  type: "loadPlayer",
                  payload: selectedChar,
                });
              }}
            />
          </Stack>
        </UiWindowComponent>
      ) : (
        <CharacterCreate setView={setView} charInfo={charInfo} />
      )}
    </Box>
  );
};
