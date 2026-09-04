export interface AccessTokenClaims {
  sub: string;
  sid?: string;
  email_verified?: boolean;
  exp?: number;
}

export function readAccessToken(token: string): AccessTokenClaims | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded)) as AccessTokenClaims;
  } catch {
    return null;
  }
}
