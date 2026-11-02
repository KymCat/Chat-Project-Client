const PENDING_REDIRECT_KEY = "veritas.pendingRedirect";

export function getSafeRedirectPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/chat";
  }

  return value;
}

export function getRedirectFromSearch(search: string) {
  return getSafeRedirectPath(new URLSearchParams(search).get("redirect"));
}

export function savePendingRedirect(path: string) {
  window.sessionStorage.setItem(
    PENDING_REDIRECT_KEY,
    getSafeRedirectPath(path),
  );
}

export function readAndClearPendingRedirect() {
  const redirectPath = getSafeRedirectPath(
    window.sessionStorage.getItem(PENDING_REDIRECT_KEY),
  );
  window.sessionStorage.removeItem(PENDING_REDIRECT_KEY);
  return redirectPath;
}
