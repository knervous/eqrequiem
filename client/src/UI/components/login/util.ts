export const DISCORD_CLIENT_ID = '1354327280532459582';
export const url =
  import.meta.env.VITE_DISCORD_REDIRECT_URI?.trim() ||
  new URL('/login', window.location.origin).toString();
export const REDIRECT_URI = encodeURIComponent(url);
export const RESPONSE_TYPE = 'code';
export const SCOPE = encodeURIComponent('identify');
