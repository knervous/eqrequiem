import {
  Box,
  CardContent,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/material";
import React, { useEffect } from "react";

export const SplashScreen: React.FC = ({ files = [] }) => {
  return (
    <Box
      sx={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background: "rgba(0, 0, 0, 0.6)",
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
