import React from "react";
import { Box } from "@mui/material";

import { MainProvider, useMainContext } from "../components/context";

import BabylonWrapper from "./babylon";
import { SplashScreen } from "./splash";

const bgMax = 1; //6;
const sessionBg = `center no-repeat url('requiem/bg${Math.ceil(
  Math.random() * bgMax,
)}.png')`;

const GameContainerComponent: React.FC = () => {
  const { ready, splash } = useMainContext();
  return (
    <Box      sx={{
      background: sessionBg,
      backgroundSize: "cover",
    }}>
      {(splash || !ready) && <SplashScreen />}
      {ready ? <BabylonWrapper splash={splash} /> : null}
    </Box>
  );
};

export const GameContainer = () => {
  return  <MainProvider>
    <GameContainerComponent />
  </MainProvider>;
};

export default GameContainer;
