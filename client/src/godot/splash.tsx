import {
  Box,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/material";
import React from "react";
import { getSplashImage } from "../UI/common/splash";
let splashImage = getSplashImage();
setInterval(() => {
  if (splashImage !== getSplashImage()) {
    splashImage = getSplashImage();
  }
}, 5000);

export const SplashScreen: React.FC = ({ files = [] }) => {
  return (
    <Box
      className="splash-screen"
      sx={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background: `
        radial-gradient(circle at center, rgba(0, 0, 0, 0) 30%, rgba(0, 0, 0, 0.9) 100%),
        url(${splashImage}) center / auto 100% no-repeat
        `, // Vignette overlay + background image
        backgroundColor: "#1a1a1a", // Very dark gray base color
        zIndex: 1000,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Stack direction="column" justifyContent={"center"} alignItems={"center"}>
        <Box sx={{ marginTop: "50px", marginBottom: "50px" }}>
          <img
            src="/brand/png/logo-no-background-white.png"
            width={400}
            alt="logo"
          />
        </Box>

        <Box>
          <Typography variant="h4" component="h1" gutterBottom>
            LOADING, PLEASE WAIT...
          </Typography>
          {files.map((f) => (
            <Typography sx={{ textAlign: "center" }} key={f.name}>
              Converting {f.name}...
              <br />
            </Typography>
          ))}
        </Box>
        <Box sx={{ margin: "25px" }}>
          <CircularProgress size={100} />
        </Box>
      </Stack>
    </Box>
  );
};
