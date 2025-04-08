import React, { useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Box, List, ListItem, Stack, Typography } from "@mui/material";
import { WorldSocket } from "../../net/instances";
import { ImageCache } from "../../util/image-cache";
import DiscordIcon from "./discord";
import { useUIContext } from "../context";
import { UiButtonComponent } from "../../common/ui-button";
import { DISCORD_CLIENT_ID, REDIRECT_URI, RESPONSE_TYPE, SCOPE } from "./util";

const defaultWorldName = 'requiem';

export const LoginWindowComponent: React.FC = () => {
  const navigate = useNavigate();
  const setMode = useUIContext((state) => state.setMode);
  const token = useUIContext((state) => state.token);
  const [imageTiles, setImageTiles] = React.useState<string[]>([]);
  const [selectedServer, setSelectedServer] = React.useState<number>(0);

  // Sample server data (expandable)
  const servers = [
    { name: "EQ: Requiem", playersOnline: 42 },
    { name: "EQ: Legacy", playersOnline: 15 },
  ];



  const connectToWorld = useCallback(async (worldName = defaultWorldName) => {
    let storedDetails = null;
    try {
      const storedDetailsString = localStorage.getItem(worldName);
      if (storedDetailsString) {
        storedDetails = JSON.parse(storedDetailsString);
      }
    } catch (e) {
      console.error("Error parsing stored world details:", e);
    }
    if (!storedDetails) {
      const discordAuthUrl = `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&response_type=${RESPONSE_TYPE}&redirect_uri=${REDIRECT_URI}&scope=${SCOPE}`;
      window.location.href = discordAuthUrl;
    }
    await WorldSocket.connect(
      "eqrequiem.ddns.net",
      443,
      () => {
        console.log("Disconnected");
        navigate('/');
      },
    );
    token.current = storedDetails.token;
    setMode('character-select');
  }, [setMode, token, navigate]);

  useEffect(() => {
    Promise.all(
      Array.from({ length: 6 }).map((_, i) => {
        return ImageCache.getImageUrl("uifiles/default", `EQLS_WndBorder_0${i + 1}.tga`);
      }),
    ).then(setImageTiles);
  }, []);

  useEffect(() => {
    if (sessionStorage.getItem('worldLogin') === defaultWorldName) {
      connectToWorld(defaultWorldName);
      sessionStorage.removeItem('worldLogin');
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
        '*': { 
          fontFamily: "Arial, sans-serif !important",
        },
      }}
    >
      {/* Background Image Tiles */}
      {imageTiles.length === 6 && (
        <>
          {/* Row 1 */}
          <Box sx={{ background: `url(${imageTiles[0]}) no-repeat`, width: "256px" }} />
          <Box sx={{ background: `url(${imageTiles[1]}) no-repeat`, width: "256px", marginLeft: "-2px" }} />
          <Box sx={{ background: `url(${imageTiles[2]}) no-repeat`, width: "128px", marginLeft: "-4px" }} />
          {/* Row 2 */}
          <Box sx={{ background: `url(${imageTiles[3]}) no-repeat`, width: "256px" }} />
          <Box sx={{ background: `url(${imageTiles[4]}) no-repeat`, width: "256px", marginLeft: "-2px" }} />
          <Box sx={{ background: `url(${imageTiles[5]}) no-repeat`, width: "128px", marginLeft: "-4px" }} />
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
          sx={{ width: "100%", color: "gold", fontSize: "17px", marginTop: "15px" }}
        >
          Server Select
        </Typography>
        <Box
          sx={{
            width: "calc(100% - 75px)",
            height: "270px",
            marginTop: "35px",
            marginLeft: "20px",
            background: "linear-gradient(180deg, rgba(20, 20, 20, 0.9) 0%, rgba(10, 10, 10, 0.9) 100%)", // Dark gradient
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
            <Typography sx={{ fontSize: '14px', color: "#ddd", fontWeight: "bold" }}>Server</Typography>
            <Typography sx={{ fontSize: '14px', color: "#ddd", fontWeight: "bold" }}>Players Online</Typography>
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
                    selectedServer === index ? "rgba(255, 215, 0, 0.2)" : "transparent", // Gold highlight for selected
                  "&:hover": {
                    backgroundColor: "rgba(255, 255, 255, 0.1)", // Hover effect
                  },
                  borderBottom: "1px solid #222",
                }}
              >
                <Typography sx={{ fontSize: '14px', color: "#fff" }}>{server.name}</Typography>
                <Typography sx={{ fontSize: '14px', color: "#fff", textAlign: "center" }}>
                  {server.playersOnline}
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
          spacing={2}
        >
          <UiButtonComponent
            buttonName="A_EQLS_LargeBtn"
            text={'Logout'}
            onClick={() => {
              document.cookie = 'auth_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
              window.location.href = '/';
            }}
          />

          <UiButtonComponent
            buttonName="A_EQLS_LargeBtn"
            text={'Enter World'}
            onClick={connectToWorld}
            icon={<DiscordIcon sx={{ width: '13px !important', marginRight: '10px' }} />}
          />
        </Stack>
      </Box>
    </Box>
  );
};