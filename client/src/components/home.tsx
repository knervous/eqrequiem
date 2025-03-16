import React, { ReactNode } from "react";
import { styled } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import { Button, CardContent, Stack, TextField } from "@mui/material";

import styles from "./home.module.css";

const PREFIX = "Home";
export const textFieldClasses = {
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
  Math.random() * bgMax
)}.png')`;

export const Home = () => {
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
          <CardContent sx={{marginTop: '50px', marginBottom: '50px'}}>
            <img
              src="/brand/png/logo-no-background-white.png"
              width={400}
              alt="logo"
            />
          </CardContent>
          <Stack sx={{ width: "185px", margin: "0 auto", a: {
            margin: '10px'
          } }}>
            <Button variant="contained" size="large" href="/play">
              Play
            </Button>

            <Button variant="contained" size="large" href="/signup">
              Sign Up
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
