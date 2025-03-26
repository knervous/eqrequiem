import type { VercelRequest, VercelResponse } from '@vercel/node';
import jwt from 'jsonwebtoken';

// Discord OAuth2 configuration
const CLIENT_ID = process.env.CLIENT_ID; // Add your Discord Client ID to Vercel env vars
const CLIENT_SECRET = process.env.CLIENT_KEY; // Your secret from Vercel env vars
const REDIRECT_URI = process.env.REDIRECT_URI || 'https://localhost:3000/api/auth/callback'; // Add redirect URI to Vercel env vars

async function exchangeCodeForToken(code: string) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    scope: 'identify', // Adjust scopes as needed
  });

  const response = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    body: params,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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
      iat: Math.floor(Date.now() / 1000), // Issued at
      exp: Math.floor(Date.now() / 1000) + 60 * 60, // Expires in 1 hour
    };

    const token = jwt.sign(payload, CLIENT_SECRET, { algorithm: 'HS256' });

    response.status(200).json({
      token,
      user: {
        id: user.id,
        username: user.username,
        discriminator: user.discriminator,
      },
    });
  } catch (error) {
    console.error('Error in auth handler:', error);
    response.status(500).json({ error: 'Internal server error' });
  }
}