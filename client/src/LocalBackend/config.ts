export function isLocalBackendEnabled(): boolean {
  return (
    import.meta.env.VITE_LOCAL_BACKEND === "true" ||
    new URLSearchParams(window.location.search).get("backend") === "local"
  );
}
