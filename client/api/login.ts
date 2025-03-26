import type { VercelRequest, VercelResponse } from '@vercel/node';
import jwt from 'jsonwebtoken';

// Discord OAuth2 configuration
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 'https://localhost:3000/api/auth/callback';

const COOKIE_NAME = 'auth_token';

async function exchangeCodeForToken(code: string) {
  if (!CLIENT_ID?.length || !CLIENT_SECRET?.length) {
    throw new Error('Discord client ID or secret is not set');
  }
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    scope: 'identify',
  });

  const authHeader = 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const response = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    body: params,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': authHeader,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to exchange code for token');
  }

  return response.json();
}

async function getUserInfo(accessToken: string) {
  const response = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch user info');
  }

  return response.json();
}

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  try {
    const code = request.query.code as string;

    if (!code) {
      return response.status(400).json({ error: 'No code provided' });
    }

    const tokenData = await exchangeCodeForToken(code);
    const accessToken = tokenData.access_token;

    const user = await getUserInfo(accessToken);

    const payload = {
      userId: user.id,
      username: user.username,
      discriminator: user.discriminator,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30, // 30 days
    };

    const token = jwt.sign(payload, CLIENT_SECRET, { algorithm: 'HS256' });

    const cookieOptions = {
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60,
    };

    response.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; ${Object.entries(cookieOptions)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ')}`);

    return response.redirect(302, '/auth');

  } catch (error) {
    console.error('Error in auth handler:', error);
    response.status(500).json({ error: 'Internal server error' });
  }
}