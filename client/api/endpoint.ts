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

export default async function handler() {
    console.log('Hit the handler')
  return new Response('Edge Function: OK', {
    status: 200,
  });
}