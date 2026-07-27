const returnLinkStyle = {
  position: 'fixed',
  right: '12px',
  top: '12px',
  zIndex: 10000,
  border: '1px solid rgba(255, 255, 255, 0.28)',
  borderRadius: '7px',
  padding: '7px 10px',
  background: 'rgba(8, 12, 20, 0.82)',
  color: '#fff',
  fontFamily: 'system-ui, sans-serif',
  fontSize: '12px',
  lineHeight: 1,
  textDecoration: 'none',
  backdropFilter: 'blur(8px)',
} as const;

export function ReturnToEltania() {
  return (
    <a href="/play" style={returnLinkStyle}>
      Return to Eltania
    </a>
  );
}
