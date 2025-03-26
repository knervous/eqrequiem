import React from "react";
import Button from "@mui/material/Button";
import DiscordIcon from "./discord";

const DISCORD_CLIENT_ID = "1354327280532459582";
const url = import.meta.env.DEV ? "https://localhost:3500/api/login" : "https://requiem-jade.vercel.app/api/login";
const REDIRECT_URI = encodeURIComponent(url); // your registered callback URL
const RESPONSE_TYPE = "code";
const SCOPE = encodeURIComponent("identify"); // add or remove scopes as needed

const DiscordLoginButton = () => {
  const handleLogin = () => {
    const discordAuthUrl = `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&response_type=${RESPONSE_TYPE}&redirect_uri=${REDIRECT_URI}&scope=${SCOPE}`
    window.location.href = discordAuthUrl;
  };

  return (
    <Button
      sx={{ background: "rgb(114, 137, 218)" }}
      variant="contained"
      color="primary"
      onClick={handleLogin}
      startIcon={<DiscordIcon />}
    >
      Login with Discord
    </Button>
  );
};

export default DiscordLoginButton;
