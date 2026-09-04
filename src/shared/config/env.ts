const configuredApiUrl = import.meta.env.VITE_API_BASE_URL?.trim();

export const API_BASE_URL = configuredApiUrl
  ? configuredApiUrl.replace(/\/$/, "")
  : "";

export const webSocketUrl = `${API_BASE_URL}/ws-stomp`;
