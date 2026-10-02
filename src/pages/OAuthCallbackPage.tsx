import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../app/AuthProvider";
import { ApiError } from "../shared/api/httpClient";

export function OAuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { completeOAuthLogin } = useAuth();
  const exchangeStartedRef = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (exchangeStartedRef.current) return;
    exchangeStartedRef.current = true;

    const code = searchParams.get("code");
    if (!code) {
      setError("소셜 로그인 코드가 없습니다. 다시 로그인해주세요.");
      return;
    }

    window.history.replaceState({}, document.title, "/oauth/callback");

    completeOAuthLogin(code)
      .then(() => {
        navigate("/chat", { replace: true });
      })
      .catch((requestError) => {
        setError(
          requestError instanceof ApiError
            ? requestError.message
            : "소셜 로그인을 완료하지 못했습니다.",
        );
      });
  }, [completeOAuthLogin, navigate, searchParams]);

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
