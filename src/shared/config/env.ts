const configuredApiUrl = import.meta.env.VITE_API_BASE_URL?.trim();

export const API_BASE_URL = configuredApiUrl
  ? configuredApiUrl.replace(/\/$/, "")
  : "";

export const webSocketUrl = `${API_BASE_URL}/ws-stomp`;

export function redirectToCanonicalDevelopmentOrigin() {
  if (!import.meta.env.DEV || window.location.hostname !== "127.0.0.1") {
    return false;
  }

  const canonicalUrl = new URL(window.location.href);
  canonicalUrl.hostname = "localhost";
  window.location.replace(canonicalUrl);
  return true;
}
