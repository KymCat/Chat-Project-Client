import { type FormEvent, useState } from "react";
import { useAuth } from "../app/AuthProvider";
import { useAuthTransition } from "../features/auth/AuthScene";
import { ApiError } from "../shared/api/httpClient";

export function SignupPage() {
  const { signup } = useAuth();
  const { transitionTo } = useAuthTransition();
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (password !== passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }

    setIsSubmitting(true);
    try {
      await signup({ email, nickname, password, profileImageUrl: null });
      transitionTo("/login", { replace: true });
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
    <form className="auth-form signup-form" onSubmit={handleSubmit}>
      <header>
        <h2>회원가입</h2>
      </header>

      <div className="form-row">
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
          닉네임
          <input
            type="text"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            placeholder="2~30자, 한글·영문·숫자"
            autoComplete="nickname"
            minLength={2}
            maxLength={30}
            pattern="[a-zA-Z0-9가-힣]+"
            required
          />
        </label>
      </div>

      <label>
        비밀번호
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="8자 이상 입력하세요"
          autoComplete="new-password"
          minLength={8}
          maxLength={30}
          pattern="(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z\d!@#$%^&*()_+=-]+"
          title="영문과 숫자를 포함한 8~30자로 입력하세요."
          required
        />
      </label>

      <label>
        비밀번호 확인
        <input
          type="password"
          value={passwordConfirm}
          onChange={(event) => setPasswordConfirm(event.target.value)}
          placeholder="비밀번호를 다시 입력하세요"
          autoComplete="new-password"
          minLength={8}
          maxLength={30}
          required
        />
      </label>

      {error && <p className="form-error" role="alert">{error}</p>}

      <button className="primary-button signup-submit-button" type="submit" disabled={isSubmitting}>
        <span>{isSubmitting ? "계정 생성 중..." : "계정 만들기"}</span>
        {!isSubmitting && <span aria-hidden="true">→</span>}
      </button>
    </form>
  );
}
