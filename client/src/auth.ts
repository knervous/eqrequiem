export function getCookie(name: string) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
}
  
export function parseJwt(token: string) : object | undefined {
  try {
    const base64Url = token.split('.')[1]; // Get the payload (second part)
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/'); // Convert base64url to base64
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
  
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error('Failed to parse JWT:', e);
    return undefined;
  }
}
