import React, { useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Button, List, ListItem, Stack, Typography } from "@mui/material";
import { WorldSocket } from "../../net/instances";
import { ImageCache } from "../../util/image-cache";
import DiscordIcon from "./discord";
import { useUIContext } from "../context";
import { UiButtonComponent } from "../../common/ui-button";
import { DISCORD_CLIENT_ID, REDIRECT_URI, RESPONSE_TYPE, SCOPE } from "./util";
import GameManager from "@game/Manager/game-manager";
import { USE_SAGE } from "@game/Constants/constants";
import {
  getEQFileExists,
  getFilesRecursively,
} from "sage-core/util/fileHandler";
import { supportedZones } from "@game/Constants/supportedZones";
import { fsBindings } from "@/Core/bindings";
import { qeynos2_spawns } from "@game/Constants/test-data";
import { Spawn } from "@game/Net/internal/api/capnp/common";


const defaultWorldName = "requiem";
declare const window: Window;
const doEnterSandbox =
  new URLSearchParams(window.location.search).get("sandbox") === "true";

const serverUrl = import.meta.env.VITE_LOCAL_DEV === 'true' ? '/api' : 'https://eqrequiem.ddns.net';

export const LoginWindowComponent: React.FC = () => {
  const navigate = useNavigate();
  const setMode = useUIContext((state) => state.setMode);
  const token = useUIContext((state) => state.token);
  const [imageTiles, setImageTiles] = React.useState<string[]>([]);
  const [selectedServer, setSelectedServer] = React.useState<number>(0);
  const [playerCount, setPlayerCount] = React.useState<number>(-1);

  const enterSandbox = useCallback(() => {
    setMode("game");
    GameManager.instance.loadZoneId(2);
    GameManager.instance.instantiatePlayer({
      race: 1,
      charClass: 1,
      name: "Soandso",
      x: 15,
      y: 15,
      z: 15,
      face: 4,
    });
    qeynos2_spawns.forEach((spawn) => { 
      GameManager.instance.ZoneManager?.EntityPool?.AddSpawn(spawn as Spawn);
    });
  }, [setMode]);

  const servers = [
    { name: "EQ: Requiem", playersOnline: playerCount },
  ];


  const connectToWorld = useCallback(
    async () => {
      const worldName = defaultWorldName;
      let storedDetails: ({ token: string} | null) = null;
      try {
        const storedDetailsString = localStorage.getItem(worldName);
        if (storedDetailsString) {
          storedDetails = JSON.parse(storedDetailsString);
        }
      } catch (e) {
        console.error("Error parsing stored world details:", e);
      }
      const local = import.meta.env.VITE_LOCAL_DEV === 'true';
      if (!storedDetails && !local) {
        const discordAuthUrl = `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&response_type=${RESPONSE_TYPE}&redirect_uri=${REDIRECT_URI}&scope=${SCOPE}`;
        window.location.href = discordAuthUrl;
      }

      if (
        await WorldSocket.connect("eqrequiem.ddns.net", 443, () => {
          console.log("Disconnected");
          navigate("/");
        })
      ) {
        if (local) {
          token.current = "local";
        } else {
          if (storedDetails === null) {
            return;
          }
          token.current = storedDetails.token;
        }
        setMode("character-select");
      }
    },
    [setMode, token, navigate],
  );

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    setTimeout(() => {
      controller.abort();
    }, 2000);
    fetch(`${serverUrl}/playercount`, {
      method: "GET",
      mode: "cors",
      signal,
    }).then((response) => {
      if (!response.ok) {
        console.error("Failed to fetch player count");
        return;
      }
      return response.json();
    }).then((data) => {
      if (data && data.count !== undefined) {
        setPlayerCount(data.count);
      } else {
        console.error("Invalid player count data", data);
      }
    }).catch((error) => {
      console.error("Error fetching player count:", error);
    });
  }, []);  


  useEffect(() => {
    const kbCallback = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        navigate("/");
      }
      if (e.key === "Enter") {
        if (selectedServer >= 0 && selectedServer < servers.length) {
          connectToWorld();
        }
      }
    };
    window.addEventListener("keydown", kbCallback);
    return () => {
      window.removeEventListener("keydown", kbCallback);
    };   
  }, [navigate, connectToWorld, selectedServer, servers.length]);

  useEffect(() => {
    Promise.all(
      Array.from({ length: 6 }).map((_, i) => {
        return ImageCache.getImageUrl(
          "uifiles/default",
          `EQLS_WndBorder_0${i + 1}.webp`,
        );
      }),
    ).then(setImageTiles);
    document.title = "EQ: Requiem";

    if (doEnterSandbox) {
      setTimeout(() => {
        enterSandbox();
      }, 1);
    }
  }, [enterSandbox]);

  useEffect(() => {
    if (sessionStorage.getItem("worldLogin") === defaultWorldName) {
      connectToWorld();
      sessionStorage.removeItem("worldLogin");
    }
  }, [connectToWorld]);
  return (
    <Box
      sx={{
        position: "relative",
        width: `634px`, // 3 tiles wide
        height: `450px`, // 2 tiles tall
        display: "grid",
        gridTemplateRows: "1fr 1fr", // 2 rows
        gridTemplateColumns: "1fr 1fr 1fr", // 3 columns
        boxShadow: "0 0 25px 10px #000000", // Wide black shadow
        gridGap: "0px", // No gap between tiles
        "*": {
          fontFamily: "Arial, sans-serif !important",
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
              width: "256px",
            }}
          />
          <Box
            sx={{
              background: `url(${imageTiles[1]}) no-repeat`,
              width: "256px",
              marginLeft: "-2px",
            }}
          />
          <Box
            sx={{
              background: `url(${imageTiles[2]}) no-repeat`,
              width: "128px",
              marginLeft: "-4px",
            }}
          />
          {/* Row 2 */}
          <Box
            sx={{
              background: `url(${imageTiles[3]}) no-repeat`,
              width: "256px",
            }}
          />
          <Box
            sx={{
              background: `url(${imageTiles[4]}) no-repeat`,
              width: "256px",
              marginLeft: "-2px",
            }}
          />
          <Box
            sx={{
              background: `url(${imageTiles[5]}) no-repeat`,
              width: "128px",
              marginLeft: "-4px",
            }}
          />
        </>
      )}

      {/* Login Content Overlay */}
      <Box
        sx={{
          position: "absolute",
          width: "100%",
          padding: "0px 20px",
          textAlign: "center",
          overflow: "hidden",
        }}
      >
        <Typography
          variant="h6"
          sx={{
            width: "100%",
            color: "gold",
            fontSize: "17px",
            marginTop: "15px",
          }}
        >
          Server Select
        </Typography>
        <Box
          sx={{
            width: "calc(100% - 75px)",
            height: "270px",
            marginTop: "35px",
            marginLeft: "20px",
            background:
              "linear-gradient(180deg, rgba(20, 20, 20, 0.9) 0%, rgba(10, 10, 10, 0.9) 100%)", // Dark gradient
            border: "1px solid #333", // Subtle border
            overflowY: "scroll",
            "&::-webkit-scrollbar": { width: "4px" },
            "&::-webkit-scrollbar-thumb": { backgroundColor: "#555" },
          }}
        >
          {/* Header Row */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr", // Server name takes more space
              backgroundColor: "rgba(0, 0, 0, 0.8)",
              padding: "8px",
              borderBottom: "1px solid #444",
              position: "sticky",
              top: 0,
              zIndex: 1,
            }}
          >
            <Typography
              sx={{ fontSize: "14px", color: "#ddd", fontWeight: "bold" }}
            >
              Server
            </Typography>
            <Typography
              sx={{ fontSize: "14px", color: "#ddd", fontWeight: "bold" }}
            >
              Players Online
            </Typography>
          </Box>

          {/* Server List */}
          <List sx={{ padding: 0 }}>
            {servers.map((server, index) => (
              <ListItem
                key={index}
                onClick={() => setSelectedServer(index)}
                sx={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr",
                  padding: "8px",
                  cursor: "pointer",
                  backgroundColor:
                    selectedServer === index
                      ? "rgba(255, 215, 0, 0.2)"
                      : "transparent", // Gold highlight for selected
                  "&:hover": {
                    backgroundColor: "rgba(255, 255, 255, 0.1)", // Hover effect
                  },
                  borderBottom: "1px solid #222",
                }}
              >
                <Typography sx={{ fontSize: "14px", color: "#fff" }}>
                  {server.name}
                </Typography>
                <Typography
                  sx={{ fontSize: "14px", color: "#fff", textAlign: "center" }}
                >
                  {server.playersOnline === -1 ? "Offline" : server.playersOnline}
                </Typography>
              </ListItem>
            ))}
          </List>
        </Box>

        {/* Buttons */}
        <Stack
          sx={{
            margin: "15px auto",
            width: "80%",
            alignContent: "center",
            alignItems: "center",
            justifyContent: "space-around",
          }}
          direction="row"
          spacing={3}
        >
          <UiButtonComponent
            buttonName="A_EQLS_LargeBtn"
            textSx={{
              color: 'white !important',
            }}
            text={"Logout"}
            onClick={() => {
              document.cookie =
                "auth_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
              localStorage.removeItem("token");
              localStorage.removeItem("requiem");
              window.location.href = "/";
            }}
          />

          <UiButtonComponent
            buttonName="A_EQLS_LargeBtn"
            text={playerCount < 0 ? "World Offline" : "Enter World"}
            textSx={{
              color: 'white !important',
            }}
            isDisabled={playerCount < 0}
            onClick={connectToWorld}
            icon={
              <DiscordIcon
                sx={{ width: "13px !important", marginRight: "10px" }}
              />
            }
          />
        </Stack>
        <UiButtonComponent
          sx={{ float: "right", marginRight: "60px", marginTop: "-10px" }}
          buttonName="A_EQLS_LargeBtn"
          text={"Offline Mode"}
          textSx={{
            color: 'white !important',
          }}
          onClick={enterSandbox}
        />
      </Box>
      {USE_SAGE && (
        <Box
          sx={{
            color: "white",
            position: "fixed",
            bottom: 0,
            left: 0,
            padding: "10px",
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            zIndex: 100,
          }}
        >
          Dev Commands
          <br />
          <Button
            variant="contained"
            onClick={async () => {

              // sky
              // console.log('Processing sky');
              // const skyFiles = ["sky.s3d"];
              // await fsBindings.processFiles('sky', skyFiles);

              // //load2
              console.log('Processing load2');
              const load2Files = ["load2.s3d","load2_obj.s3d"];
              await fsBindings.processFiles('load2', load2Files);
              // First do global
              console.log('Processing global');
              const globalCharFiles = ["global_chr.s3d", "global3_chr.s3d", "global4_chr.s3d"];
              await fsBindings.processFiles('global_chr', globalCharFiles);

              // //Items
              // console.log('Processing items');
              // const itemFiles = ["gequip.s3d", "gequip2.s3d"];
              // await fsBindings.processFiles('gequip', itemFiles);
              for (const zone of Object.values(supportedZones)) {
                continue;
                const name = zone.shortName;
  
                const associatedFiles: string[] = [];
                // temp short circuit
                if (name !== "qeynos2") {
                  continue;
                }
                const exists = await getEQFileExists("zones", `${name}.glb`);
                if (exists) {
                  console.log("Exists, skipping", name);
                //  continue;
                }
                console.log("Process", name);
                for await (const fileHandle of getFilesRecursively(
                  fsBindings.rootFileSystemHandle,
                  "",
                  new RegExp(`^${name}[_\\.].*`),
                  false,
                )) {
                  if ((!fileHandle.name.includes('qeynos2_chr'))) {
                  //  continue;
                  }
                  associatedFiles.push(fileHandle.name);
                }
                console.log(`Found ${name}`, associatedFiles);
                if (associatedFiles.length > 0) {
                  await fsBindings.processFiles(name, associatedFiles);
                }
              }
              console.log("Done");
            }}
          >
            Process s3d
          </Button>
        </Box>
      )}
    </Box>
  );
};
