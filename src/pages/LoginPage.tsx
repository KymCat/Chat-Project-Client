import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../app/AuthProvider";
import { ApiError } from "../shared/api/httpClient";

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

      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        document.querySelector(".auth-card")?.classList.add("auth-card-transitioning");
        await new Promise((resolve) => window.setTimeout(resolve, 180));
      }

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

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
          <header>
            <p className="eyebrow">WELCOME BACK</p>
            <h2>로그인</h2>
            <p>계정으로 돌아가 대화를 이어가세요.</p>
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

          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "로그인 중..." : "로그인"}
          </button>

          <p className="form-switch">
            아직 계정이 없나요? <Link to="/signup">회원가입</Link>
          </p>
    </form>
  );
}
