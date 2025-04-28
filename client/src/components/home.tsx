import React, { useEffect } from "react";
import { styled } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import { Button, CardContent, Stack, TextField } from "@mui/material";

import styles from "./home.module.css";
import { useNavigate } from "react-router-dom";
import { DISCORD_CLIENT_ID, REDIRECT_URI } from "../UI/components/login/util";
import { USE_SAGE } from "@game/Constants/constants";
import DiscordIcon from "@ui/components/login/discord";

const REQUIEM_DISCORD_URL = "https://discord.gg/ptJxyejwXt";
const PREFIX = "Home";
const textFieldClasses = {
  root: `${PREFIX}-root`,
};
const StyledBox = styled(Box)({
  [`& .${textFieldClasses.root}`]: {
    "& label.Mui-focused": {
      color: "white",
    },
    "& .MuiOutlinedInput-root": {
      "& fieldset": {},
      "&:hover fieldset": {
        borderColor: "white",
      },
      "&.Mui-focused fieldset": {
        borderColor: "white",
      },
    },
  },
});

export const CssTextField = TextField;

const bgMax = 1; //6;
const prefix = "electronAPI" in window ? "./" : "/";
const sessionBg = `center no-repeat url('requiem/bg${Math.ceil(
  Math.random() * bgMax,
)}.png')`;

export const Home = () => {
  const navigate = useNavigate();
  useEffect(() => {
    const queryParamCode = new URLSearchParams(window.location.search).get("code");
    if (queryParamCode) {
      const url = new URL(window.location.href);
      url.searchParams.delete("code");
      window.history.replaceState({}, document.title, url.toString());
      (async () => {
        const { user, token } = await fetch("https://eqrequiem.ddns.net/code", {
          method: "POST",
          body: JSON.stringify({
            code: queryParamCode,
            client_id: DISCORD_CLIENT_ID,
            redirect_uri: decodeURIComponent(REDIRECT_URI),
          }),
        })
          .then((r) => r.json())
          .catch((e) => { 
            console.log('Error:', e);
            return {};
          });
        if (!user || !token) {
          navigate('/');
          return;
        }
        localStorage.setItem('requiem', JSON.stringify({ user, token }));
        // Will extend this to other server shortnames eventually
        sessionStorage.setItem('worldLogin', 'requiem');
        navigate('/play');
      })();
    }

  }, [navigate]);
  return (
    <Box
      sx={{
        background: sessionBg,
        backgroundSize: "cover",
      }}
      className={styles.app}
    >
      <StyledBox
        className="content-card"
        sx={{ minWidth: 275, height: "100%" }}
      >
        <Card
          variant="outlined"
          sx={{
            position: "fixed",
            height: "100vh",
            width: "100vw",
            maxHeight: "100vh",
            overflowY: "hidden",
            background: sessionBg,
            backgroundSize: "cover",
          }}
        >
          <CardContent sx={{ marginTop: '50px', marginBottom: '50px' }}>
            <img
              src="/brand/png/logo-no-background-white.png"
              width={400}
              alt="logo"
            /> 
          </CardContent>
          <Stack sx={{ width: "285px", margin: "0 auto" }} spacing={1}>
            <Button variant="contained" color={'primary'} sx={{ margin: 0 }} href="/play">
              <img src="/requiem.png" width={'20px'} style={{ position: 'absolute', left: '5px' }} />
              Play
            </Button>
            <Button onClick={() => {
              window.open(REQUIEM_DISCORD_URL, "_blank");
            }} variant="contained" color={'primary'} sx={{ margin: 0, background: 'rgb(88, 101, 242)' }}>
              <DiscordIcon style={{ position: 'absolute', left: '5px'  }} size={20} color="white" />     Join Discord
            </Button>
          </Stack>

          <footer
            style={{
              position: "fixed",
              bottom: 15,
              left: 15,
              textAlign: "left",
              maxWidth: "55%",
              color: "white",
            }}
          >
            EverQuest is a registered trademark of Daybreak Game Company LLC.
            <br />
            EQ Requiem is not associated or affiliated in any way with Daybreak
            Game Company LLC.
          </footer>
        </Card>
      </StyledBox>
    </Box>
  );
};
