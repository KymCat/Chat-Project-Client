import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../app/AuthProvider";
import { ApiError } from "../shared/api/httpClient";
import { readAndClearPendingRedirect } from "../features/auth/redirect";
import {
  clearSocialReauthenticationAction,
  consumeSocialReauthenticationAction,
} from "../features/auth/reauthenticationAction";

export function OAuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    completeOAuthLogin,
    completeSocialLogoutAll,
    completeSocialWithdrawal,
  } = useAuth();
  const exchangeStartedRef = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (exchangeStartedRef.current) return;
    exchangeStartedRef.current = true;

    const oauthError = searchParams.get("oauthError");
    if (oauthError === "true") {
      window.history.replaceState({}, document.title, "/oauth/callback");
      setError("Google 로그인을 완료하지 못했습니다. 다시 시도해주세요.");
      return;
    }

    const reauthenticationError = searchParams.get("reauthError");
    if (reauthenticationError === "true") {
      clearSocialReauthenticationAction();
      window.history.replaceState({}, document.title, "/oauth/callback");
      setError("Google 재인증을 완료하지 못했습니다. 다시 시도해주세요.");
      return;
    }

    const reauthenticationCode = searchParams.get("reauthCode");
    if (reauthenticationCode) {
      window.history.replaceState({}, document.title, "/oauth/callback");

      const action = consumeSocialReauthenticationAction();
      if (!action) {
        setError("재인증 요청 정보를 확인할 수 없습니다. 다시 시도해주세요.");
        return;
      }

      const completeReauthentication = action === "LOGOUT_ALL"
        ? completeSocialLogoutAll
        : completeSocialWithdrawal;

      completeReauthentication(reauthenticationCode)
        .then(() => navigate("/login", { replace: true }))
        .catch((requestError) => {
          setError(
            requestError instanceof ApiError
              ? requestError.message
              : action === "LOGOUT_ALL"
                ? "모든 기기 로그아웃을 완료하지 못했습니다."
                : "회원탈퇴를 완료하지 못했습니다.",
          );
        });
      return;
    }

    const code = searchParams.get("code");
    if (!code) {
      setError("소셜 로그인 코드가 없습니다. 다시 로그인해주세요.");
      return;
    }

    window.history.replaceState({}, document.title, "/oauth/callback");

    completeOAuthLogin(code)
      .then(() => {
        navigate(readAndClearPendingRedirect(), { replace: true });
      })
      .catch((requestError) => {
        setError(
          requestError instanceof ApiError
            ? requestError.message
            : "소셜 로그인을 완료하지 못했습니다.",
        );
      });
  }, [
    completeOAuthLogin,
    completeSocialLogoutAll,
    completeSocialWithdrawal,
    navigate,
    searchParams,
  ]);

  return (
    <main className="loading-screen" aria-live="polite">
      <img className="brand-logo" src="/veritas-logo.png" alt="Veritas" />
      {error ? (
        <>
          <p className="oauth-callback-error" role="alert">{error}</p>
          <Link className="oauth-callback-link" to="/login">
            로그인 화면으로 돌아가기
          </Link>
        </>
      ) : (
        <p>소셜 로그인을 완료하고 있습니다.</p>
      )}
    </main>
  );
}
