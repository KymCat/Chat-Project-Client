const LOGOUT_ALL_NOTICE_KEY = "auth:logout-all-notice";

export const LOGOUT_ALL_NOTICE =
  "모든 기기에서 로그아웃되었습니다. 계속하려면 다시 로그인해주세요.";

export const PASSWORD_CHANGED_NOTICE =
  "비밀번호가 변경되었습니다. 새 비밀번호로 다시 로그인해주세요.";

export const ACCOUNT_WITHDRAWN_NOTICE =
  "회원탈퇴가 완료되었습니다.";

export function saveLogoutAllNotice() {
  if (window.sessionStorage.getItem(LOGOUT_ALL_NOTICE_KEY)) {
    return;
  }

  window.sessionStorage.setItem(
    LOGOUT_ALL_NOTICE_KEY,
    LOGOUT_ALL_NOTICE,
  );
}

export function savePasswordChangedNotice() {
  window.sessionStorage.setItem(
    LOGOUT_ALL_NOTICE_KEY,
    PASSWORD_CHANGED_NOTICE,
  );
}

export function saveAccountWithdrawnNotice() {
  window.sessionStorage.setItem(
    LOGOUT_ALL_NOTICE_KEY,
    ACCOUNT_WITHDRAWN_NOTICE,
  );
}

export function readLogoutAllNotice() {
  return window.sessionStorage.getItem(LOGOUT_ALL_NOTICE_KEY);
}

export function clearLogoutAllNotice() {
  window.sessionStorage.removeItem(LOGOUT_ALL_NOTICE_KEY);
}
