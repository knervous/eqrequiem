import React from "react";
import { LoginWindowComponent } from "./login-window";
import { Box } from "@mui/material";
import { getSplashImage } from "../../common/splash";

export const LoginUIComponent: React.FC = () => {
  return (
    <Box
      sx={{
        background: `
          radial-gradient(circle at center, rgba(0, 0, 0, 0) 30%, rgba(0, 0, 0, 0.9) 100%),
          url(${getSplashImage()}) center / auto 100% no-repeat
        `, // Vignette overlay + background image
        backgroundColor: "#1a1a1a", // Very dark gray base color
        width: "100vw",
        height: "100vh",
        display: "flex", // Flexbox layout
        justifyContent: "center", // Center horizontally
        alignItems: "center", // Center vertically
      }}
    >
      <LoginWindowComponent />
    </Box>
  );
};