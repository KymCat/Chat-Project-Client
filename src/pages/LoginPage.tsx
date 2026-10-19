import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../app/AuthProvider";
import { ApiError } from "../shared/api/httpClient";
import { API_BASE_URL } from "../shared/config/env";

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await login({ email, password });

      navigate("/chat", { replace: true });
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "서버에 연결할 수 없습니다.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = () => {
    window.location.assign(`${API_BASE_URL}/oauth2/authorization/google`);
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <header>
        <h2>로그인</h2>
      </header>

      <label>
        이메일
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@example.com"
          autoComplete="email"
          maxLength={254}
          required
        />
      </label>

      <label>
        비밀번호
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="비밀번호를 입력하세요"
          autoComplete="current-password"
          required
        />
      </label>

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="login-actions">
        <button
          className="primary-button login-submit-button"
          type="submit"
          disabled={isSubmitting}
          aria-label={isSubmitting ? "로그인 중" : "로그인"}
        >
          <span aria-hidden="true">{isSubmitting ? "…" : ">"}</span>
        </button>

        <button
          className="oauth-button google-login-button"
          type="button"
          onClick={handleGoogleLogin}
          disabled={isSubmitting}
          aria-label="구글로 로그인"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285f4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.01v2.55h3.24c1.9-1.75 2.98-4.32 2.98-7.41Z" />
            <path fill="#34a853" d="M12 22c2.7 0 4.98-.9 6.63-2.36l-3.24-2.55c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.63A10 10 0 0 0 12 22Z" />
            <path fill="#fbbc05" d="M6.39 13.92A6 6 0 0 1 6.07 12c0-.67.12-1.32.32-1.92V7.45H3.04A10 10 0 0 0 2 12c0 1.64.39 3.19 1.04 4.55l3.35-2.63Z" />
            <path fill="#ea4335" d="M12 5.95c1.47 0 2.79.51 3.83 1.5l2.87-2.88A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.96 5.45l3.35 2.63C7.18 7.71 9.39 5.95 12 5.95Z" />
          </svg>
          <span className="google-tooltip" role="tooltip">구글로 로그인</span>
        </button>
      </div>
    </form>
  );
}
