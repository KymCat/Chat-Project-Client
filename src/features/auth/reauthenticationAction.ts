export type SocialReauthenticationAction =
  | "LOGOUT_ALL"
  | "WITHDRAW_ACCOUNT";

const SOCIAL_REAUTHENTICATION_ACTION_KEY =
  "auth:social-reauthentication-action";

export function saveSocialReauthenticationAction(
  action: SocialReauthenticationAction,
) {
  window.sessionStorage.setItem(
    SOCIAL_REAUTHENTICATION_ACTION_KEY,
    action,
  );
}

export function consumeSocialReauthenticationAction():
  SocialReauthenticationAction | null {
  const action = window.sessionStorage.getItem(
    SOCIAL_REAUTHENTICATION_ACTION_KEY,
  );
  window.sessionStorage.removeItem(SOCIAL_REAUTHENTICATION_ACTION_KEY);

  if (action === "LOGOUT_ALL" || action === "WITHDRAW_ACCOUNT") {
    return action;
  }

  return null;
}

export function clearSocialReauthenticationAction() {
  window.sessionStorage.removeItem(SOCIAL_REAUTHENTICATION_ACTION_KEY);
}
