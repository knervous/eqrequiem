import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useUIContext } from "../context";
import { WorldSocket } from "../../net/instances";
import { Box, Stack } from "@mui/material";
import { UiWindowComponent } from "../../common/ui-window";
import { UiButtonComponent } from "../../common/ui-button";
import { VIEWS } from "../../../Game/Constants/constants";
import { CharacterCreate } from "./char-create";
import GameManager from "@game/Manager/game-manager";
import { MusicPlayer } from "@game/Music/music-player";
import { OpCodes } from "@game/Net/opcodes";
import { Int, String } from "@game/Net/internal/api/capnp/common";
import { EnterWorld, JWTLogin, JWTResponse } from "@game/Net/internal/api/capnp/world";
import { CharacterSelect, CharacterSelectEntry } from "@game/Net/internal/api/capnp/player";
import { RequestClientZoneChange, ZoneChangeType, ZoneSession } from "@game/Net/internal/api/capnp/zone";

import "./component.css";

let splashed = false;

export const CharacterSelectUIComponent: React.FC = () => {
  const setMode = useUIContext((state) => state.setMode);
  const token = useUIContext((state) => state.token);
  const [view, setView] = useState(VIEWS.CHAR_SELECT);
  const setSplash = window.setSplash;
  const [charInfo, setCharInfo] =
    React.useState<CharacterSelect | null>(null);
  const [gotCharInfo, setGotCharInfo] = React.useState(false);
  const [selectedChar, setSelectedChar] =
    React.useState<CharacterSelectEntry | null>(null);

  const charSelectHandler = useCallback(
    async (charInfo: CharacterSelect) => {
      await GameManager.instance.loadCharacterSelect();
      setGotCharInfo(true);
      setCharInfo(charInfo);
      setSelectedChar(charInfo?.characters[0] ?? null);
      if (!splashed) {
        setSplash?.(true);
        setTimeout(() => {
          setSplash?.(false);
          setSplash?.(false);
        }, 1000);
        splashed = true;
      }
    },
    [setSplash],
  );

  useEffect(() => {
    document.title = "EQ: Requiem";
    MusicPlayer.play("character-select");
  }, []);

  const enterWorld = useCallback(() => {
    if (!selectedChar) {
      return;
    }

    WorldSocket.registerOpCodeHandler(
      OpCodes.ZoneSessionValid,
      Int,
      (data) => {
        console.log('Zone session valid:', data);
        if (data) {
          WorldSocket.sendMessage(
            OpCodes.RequestClientZoneChange,
            RequestClientZoneChange,
            { 
              type: ZoneChangeType.FROM_WORLD, // Type 0 is zone in from world
            },
          );
        } else {
          alert("Could not enter world");
        }
      },
    );
    WorldSocket.registerOpCodeHandler(
      OpCodes.PostEnterWorld,
      Int,
      (data) => {
        if (data.value === 1) {
          WorldSocket.sendMessage(
            OpCodes.ZoneSession,
            ZoneSession,
            { 
              zoneId: selectedChar.zone,
              instanceId: 0,
            },
          );
        } else {
          alert("Could not enter world");
        }
      },
    );
    WorldSocket.sendMessage(
      OpCodes.EnterWorld,
      EnterWorld,
      { name: selectedChar.name, tutorial: 0, returnHome: 0 },
    );
  }, [selectedChar]);

  useEffect(() => {
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMode("login");
        GameManager.instance.dispose();
        WorldSocket.close();
      } else if (e.key === "Enter") {
        enterWorld();
      }
    };
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("keydown", keyHandler);
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

    WorldSocket.registerOpCodeHandler<Int>(
      OpCodes.JWTResponse,
      JWTResponse,
      (e) => {
        console.log('JWT Response', e.value);
      },
    );

    WorldSocket.sendMessage(OpCodes.JWTLogin, JWTLogin, {
      token: token.current,
    });
    
  }, [setMode, charSelectHandler, token, setSplash]);

  const charSelectNum = useMemo(() => {
    return 8 - (charInfo?.characterCount ?? 0);
  }, [charInfo?.characterCount]);

  useEffect(() => {
    if (!gotCharInfo || view === VIEWS.CHAR_CREATE) {
      GameManager.instance.CharacterSelect?.loadModel({
        race: 0,
        charClass: 0,
      } as CharacterSelectEntry);
      return;
    }
    GameManager.instance.CharacterSelect?.loadModel(
      selectedChar ??
        ({
          race: 0,
          charClass: 0,
          name: "Soandso",
          level: 1,
        } as CharacterSelectEntry),
    );
  }, [selectedChar?.name, gotCharInfo, view]); // eslint-disable-line

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
                  GameManager.instance.dispose();
                  WorldSocket.close();
                }}
              />
              <UiButtonComponent
                buttonName="A_SmallBtn"
                text={"Delete"}
                isDisabled={!selectedChar}
                scale={1.3}
                textFontSize="11px"
                sx={{ margin: "12px" }}
                onClick={() => {
                  if (!selectedChar) {
                    return;
                  }
                  WorldSocket.sendMessage(
                    OpCodes.DeleteCharacter,
                    String,
                    { value: selectedChar.name },
                  );
                }}
              />
            </Stack>
            <UiButtonComponent
              buttonName="A_BigBtn"
              text={"Enter World"}
              isDisabled={!selectedChar}
              scale={1.5}
              textFontSize="9px"
              sx={{ margin: "12px" }}
              onClick={enterWorld}
            />
          </Stack>
        </UiWindowComponent>
      ) : (
        <CharacterCreate setView={setView} charInfo={charInfo} />
      )}
    </Box>
  );
};
