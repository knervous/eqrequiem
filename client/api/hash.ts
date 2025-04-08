// file: _api/endpoint.ts

// Should run on edge runtime
export const edge = true;

// Always add those header to this endpoint
export const headers = {
  'Some-Header': 'some value',
};

// Stream the response
export const streaming = true;

// Enable Incremental Static Regeneration for this endpoint
export const isr = {
  expiration: 30,
};

export default async function handler(req, res) {
  const port = req.query.port;
  const ip = req.query.ip;

  if (!port || !ip) {
    res.send('');
    return;
  }
  const hash = await fetch(`http://${ip}:${port}/hash`).then(r => r.text()).catch(() => '');
  res.send(hash);
}