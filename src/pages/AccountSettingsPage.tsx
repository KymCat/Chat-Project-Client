import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "../styles/chat.css";
import { useAuth } from "../app/AuthProvider";
import {
  authApi,
  type ReauthenticationMethodResponse,
  type ReauthenticationPurpose,
} from "../features/auth/api";
import {
  clearLogoutAllNotice,
  savePasswordChangedNotice,
} from "../features/auth/notice";
import {
  clearSocialReauthenticationAction,
  saveSocialReauthenticationAction,
  type SocialReauthenticationAction,
} from "../features/auth/reauthenticationAction";
import { connectAuthEvents } from "../features/auth/stompClient";
import { memberApi } from "../features/member/api";
import { API_BASE_URL } from "../shared/config/env";
import { TerminalModalTransition } from "../shared/ui/TerminalModalTransition";

type AccountAction =
  | "CHANGE_PASSWORD"
  | "LOGOUT_ALL"
  | "WITHDRAW_ACCOUNT";

const actionContent: Record<
  AccountAction,
  { command: string; title: string; description: string; confirmLabel: string }
> = {
  CHANGE_PASSWORD: {
    command: "$ account --change-password",
    title: "비밀번호 변경",
    description:
      "변경 후 모든 기기에서 로그아웃되며 새 비밀번호로 다시 로그인해야 합니다.",
    confirmLabel: "비밀번호 변경",
  },
  LOGOUT_ALL: {
    command: "$ session --logout-all",
    title: "모든 기기에서 로그아웃",
    description: "현재 기기를 포함한 모든 로그인 Session이 종료됩니다.",
    confirmLabel: "모든 기기 로그아웃",
  },
  WITHDRAW_ACCOUNT: {
    command: "$ account --withdraw",
    title: "회원탈퇴",
    description:
      "계정 이용이 종료되며 탈퇴 후에는 다시 로그인할 수 없습니다.",
    confirmLabel: "회원탈퇴",
  },
};

export function AccountSettingsPage() {
  const {
    accessToken,
    forceLogout,
    logoutAllSessions,
    withdrawAccount,
  } = useAuth();
  const [reauthenticationMethod, setReauthenticationMethod] =
    useState<ReauthenticationMethodResponse | null>(null);
  const [activeAction, setActiveAction] = useState<AccountAction | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [pageError, setPageError] = useState("");
  const [actionError, setActionError] = useState("");
  const [isLoadingMethod, setIsLoadingMethod] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    authApi.getReauthenticationMethod()
      .then((method) => {
        if (active) setReauthenticationMethod(method);
      })
      .catch((requestError) => {
        if (!active) return;
        setPageError(
          requestError instanceof Error
            ? requestError.message
            : "계정 인증 정보를 확인하지 못했습니다.",
        );
      })
      .finally(() => {
        if (active) setIsLoadingMethod(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!accessToken) return;

    const connection = connectAuthEvents({
      accessToken,
      onForceLogout: forceLogout,
      onError: setPageError,
    });

    return () => connection.disconnect();
  }, [accessToken, forceLogout]);

  const resetActionForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setNewPasswordConfirm("");
    setActionError("");
  };

  const handleOpenAction = (action: AccountAction) => {
    if (isLoadingMethod || !reauthenticationMethod) return;
    if (
      action === "CHANGE_PASSWORD"
      && reauthenticationMethod.type === "SOCIAL"
    ) {
      return;
    }

    resetActionForm();
    setActiveAction(action);
  };

  const handleCloseAction = () => {
    if (isSubmitting) return;
    setActiveAction(null);
    resetActionForm();
  };

  const validateNewPassword = () => {
    if (
      newPassword.length < 8
      || newPassword.length > 30
      || !/^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z\d!@#$%^&*()_+=-]+$/.test(newPassword)
    ) {
      setActionError("새 비밀번호는 영문과 숫자를 포함한 8~30자여야 합니다.");
      return false;
    }
    if (newPassword !== newPasswordConfirm) {
      setActionError("새 비밀번호가 일치하지 않습니다.");
      return false;
    }
    if (currentPassword === newPassword) {
      setActionError("기존 비밀번호와 다른 비밀번호를 입력해주세요.");
      return false;
    }
    return true;
  };

  const handlePasswordAction = async () => {
    if (
      isSubmitting
      || !activeAction
      || reauthenticationMethod?.type !== "PASSWORD"
      || !currentPassword
    ) {
      return;
    }
    if (activeAction === "CHANGE_PASSWORD" && !validateNewPassword()) return;

    setIsSubmitting(true);
    setActionError("");

    try {
      const reauthenticationToken =
        await authApi.reauthenticateWithPassword({
          password: currentPassword,
          purpose: activeAction satisfies ReauthenticationPurpose,
        });

      if (activeAction === "CHANGE_PASSWORD") {
        savePasswordChangedNotice();
        await memberApi.changePassword(newPassword, reauthenticationToken);
        forceLogout();
        return;
      }
      if (activeAction === "LOGOUT_ALL") {
        await logoutAllSessions(reauthenticationToken);
        return;
      }

      await withdrawAccount(reauthenticationToken);
    } catch (requestError) {
      if (activeAction === "CHANGE_PASSWORD") {
        clearLogoutAllNotice();
      }
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "계정 요청을 처리하지 못했습니다.",
      );
      setIsSubmitting(false);
    }
  };

  const handleSocialAction = async () => {
    if (
      isSubmitting
      || !activeAction
      || activeAction === "CHANGE_PASSWORD"
      || reauthenticationMethod?.type !== "SOCIAL"
      || !reauthenticationMethod.provider
    ) {
      return;
    }

    setIsSubmitting(true);
    setActionError("");

    const action = activeAction satisfies SocialReauthenticationAction;
    saveSocialReauthenticationAction(action);

    try {
      await authApi.startSocialReauthentication({
        provider: reauthenticationMethod.provider,
        purpose: action,
      });
      window.location.assign(`${API_BASE_URL}/oauth2/authorization/google`);
    } catch (requestError) {
      clearSocialReauthenticationAction();
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Google 재인증을 시작하지 못했습니다.",
      );
      setIsSubmitting(false);
    }
  };

  const activeContent = activeAction ? actionContent[activeAction] : null;
  const isPasswordAccount = reauthenticationMethod?.type === "PASSWORD";
  const isSocialAccount = reauthenticationMethod?.type === "SOCIAL";

  return (
    <main className="account-settings-shell">
      <header className="account-settings-header">
        <Link to="/chat">[cd /chat] 채팅으로 돌아가기</Link>
        <p className="eyebrow">user@veritas:~$ accountctl</p>
        <h1>계정 관리</h1>
        <p># 보안 정보와 로그인 Session을 관리합니다.</p>
      </header>

      {pageError && (
        <p className="account-settings-error" role="alert">
          {pageError}
        </p>
      )}

      <div className="account-settings-sections">
        <section className="account-settings-card">
          <div>
            <p className="account-settings-card-label">[security.password]</p>
            <h2>비밀번호 변경</h2>
            <p>
              {isSocialAccount
                ? "Google 로그인 전용 계정에는 변경할 비밀번호가 없습니다."
                : "현재 비밀번호를 확인한 뒤 새로운 비밀번호로 변경합니다."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleOpenAction("CHANGE_PASSWORD")}
            disabled={isLoadingMethod || !isPasswordAccount}
          >
            {isLoadingMethod ? "$ checking..." : "$ passwd"}
          </button>
        </section>

        <section className="account-settings-card">
          <div>
            <p className="account-settings-card-label">[session.active]</p>
            <h2>모든 기기 로그아웃</h2>
            <p>현재 기기를 포함해 로그인된 모든 기기의 Session을 종료합니다.</p>
          </div>
          <button
            type="button"
            onClick={() => handleOpenAction("LOGOUT_ALL")}
            disabled={isLoadingMethod || !reauthenticationMethod}
          >
            $ logout --all
          </button>
        </section>

        <section className="account-settings-card account-settings-danger-zone">
          <div>
            <p className="account-settings-card-label">[danger.account]</p>
            <h2>회원탈퇴</h2>
            <p>탈퇴 후에는 계정에 다시 로그인할 수 없습니다.</p>
          </div>
          <button
            type="button"
            onClick={() => handleOpenAction("WITHDRAW_ACCOUNT")}
            disabled={isLoadingMethod || !reauthenticationMethod}
          >
            $ account --withdraw
          </button>
        </section>
      </div>

      <TerminalModalTransition
        visible={Boolean(activeAction && activeContent)}
        className="profile-image-confirm-modal"
      >
        {activeAction && activeContent && (
          <section
            className={`profile-image-confirm-dialog account-action-dialog${
              activeAction === "WITHDRAW_ACCOUNT" ? " is-danger" : ""
            }`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-action-title"
          >
            <p className="eyebrow">{activeContent.command}</p>
            <h2 id="account-action-title">{activeContent.title}</h2>
            <p className="profile-image-confirm-description">
              {activeContent.description}
            </p>

            {isPasswordAccount ? (
              <div className="account-action-fields">
                <label className="logout-all-password-field">
                  <span>현재 비밀번호</span>
                  <input
                    type="password"
                    value={currentPassword}
                    maxLength={30}
                    autoComplete="current-password"
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    disabled={isSubmitting}
                    autoFocus
                  />
                </label>

                {activeAction === "CHANGE_PASSWORD" && (
                  <>
                    <label className="logout-all-password-field">
                      <span>새 비밀번호</span>
                      <input
                        type="password"
                        value={newPassword}
                        minLength={8}
                        maxLength={30}
                        autoComplete="new-password"
                        onChange={(event) => setNewPassword(event.target.value)}
                        disabled={isSubmitting}
                      />
                    </label>
                    <label className="logout-all-password-field">
                      <span>새 비밀번호 확인</span>
                      <input
                        type="password"
                        value={newPasswordConfirm}
                        minLength={8}
                        maxLength={30}
                        autoComplete="new-password"
                        onChange={(event) => setNewPasswordConfirm(event.target.value)}
                        disabled={isSubmitting}
                      />
                    </label>
                  </>
                )}
              </div>
            ) : (
              <p className="logout-all-status">
                연결된 Google 계정으로 본인 확인을 진행합니다.
              </p>
            )}

            {actionError && (
              <p className="profile-image-error" role="alert">
                {actionError}
              </p>
            )}

            <footer>
              <button
                type="button"
                onClick={handleCloseAction}
                disabled={isSubmitting}
              >
                취소
              </button>
              <button
                className="account-action-confirm-button"
                type="button"
                onClick={() => {
                  if (isPasswordAccount) {
                    void handlePasswordAction();
                  } else {
                    void handleSocialAction();
                  }
                }}
                disabled={
                  isSubmitting
                  || (isPasswordAccount && !currentPassword)
                  || (
                    activeAction === "CHANGE_PASSWORD"
                    && (!newPassword || !newPasswordConfirm)
                  )
                }
              >
                {isSubmitting
                  ? activeAction === "CHANGE_PASSWORD" ? "변경 중..." : "처리 중..."
                  : isSocialAccount ? "Google로 본인 확인" : activeContent.confirmLabel}
              </button>
            </footer>
          </section>
        )}
      </TerminalModalTransition>
    </main>
  );
}
