export const DISCORD_CLIENT_ID = "1354327280532459582";
export const url = import.meta.env.DEV ? "https://localhost:3500/login" : "https://requiem-jade.vercel.app/login";
export const REDIRECT_URI = encodeURIComponent(url); // your registered callback URL
export const RESPONSE_TYPE = "code";
export const SCOPE = encodeURIComponent("identify"); // add or remove scopes as needed