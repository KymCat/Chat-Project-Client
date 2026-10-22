import { type FormEvent, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../app/AuthProvider";
import { ApiError } from "../../shared/api/httpClient";
import { API_BASE_URL } from "../../shared/config/env";

interface AuthFormProps {
  mode: "login" | "signup";
}

export function AuthForm({ mode }: AuthFormProps) {
  const navigate = useNavigate();
  const { login, signup } = useAuth();
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSignup = mode === "signup";

  useEffect(() => {
    setError("");
  }, [mode]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (isSignup && password !== passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }

    setIsSubmitting(true);

    try {
      if (isSignup) {
        await signup({ email, nickname, password, profileImageUrl: null });
        navigate("/login", { replace: true });
        return;
      }

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
    <form
      className={isSignup ? "auth-form signup-form" : "auth-form"}
      onSubmit={handleSubmit}
    >
      <motion.header layout="position">
        <AnimatePresence initial={false} mode="wait">
          <motion.h2
            key={mode}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.14 }}
          >
            {isSignup ? "회원가입" : "로그인"}
          </motion.h2>
        </AnimatePresence>
      </motion.header>

      <div className={isSignup ? "form-row" : "form-row is-login"}>
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

        <motion.div
          className="auth-secondary-field"
          initial={false}
          animate={{
            height: isSignup ? "auto" : 0,
            opacity: isSignup ? 1 : 0,
            y: isSignup ? 0 : -8,
          }}
          transition={{ duration: 0.24 }}
          aria-hidden={!isSignup}
        >
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
                required={isSignup}
                disabled={!isSignup}
                tabIndex={isSignup ? 0 : -1}
              />
          </label>
        </motion.div>
      </div>

      <label>
        비밀번호
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={isSignup ? "8자 이상 입력하세요" : "비밀번호를 입력하세요"}
          autoComplete={isSignup ? "new-password" : "current-password"}
          minLength={isSignup ? 8 : undefined}
          maxLength={isSignup ? 30 : undefined}
          pattern={isSignup ? "(?=.*[a-zA-Z])(?=.*\\d)[a-zA-Z\\d!@#$%^&*()_+=-]+" : undefined}
          title={isSignup ? "영문과 숫자를 포함한 8~30자로 입력하세요." : undefined}
          required
        />
      </label>

      <motion.div
        className="auth-secondary-field"
        initial={false}
        animate={{
          height: isSignup ? "auto" : 0,
          opacity: isSignup ? 1 : 0,
          y: isSignup ? 0 : -8,
        }}
        transition={{ duration: 0.24 }}
        aria-hidden={!isSignup}
      >
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
              required={isSignup}
              disabled={!isSignup}
              tabIndex={isSignup ? 0 : -1}
            />
        </label>
      </motion.div>

      <AnimatePresence initial={false} mode="popLayout">
        {error && (
          <motion.p
            className="form-error"
            role="alert"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <div
        className={isSignup ? "auth-actions is-signup" : "auth-actions is-login"}
      >
        <div className="auth-primary-slot">
          <button
            className={isSignup
              ? "primary-button signup-submit-button"
              : "primary-button login-submit-button"}
            type="submit"
            disabled={isSubmitting}
            aria-label={isSignup
              ? (isSubmitting ? "계정 생성 중" : "계정 만들기")
              : (isSubmitting ? "로그인 중" : "로그인")}
          >
            <AnimatePresence initial={false} mode="wait">
              <motion.span
                key={`${mode}-${isSubmitting}`}
                className={isSignup ? "auth-submit-content is-signup" : "auth-submit-content"}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.1 }}
              >
                {isSignup ? (
                  <>
                    <span>{isSubmitting ? "계정 생성 중..." : "계정 만들기"}</span>
                    {!isSubmitting && <span aria-hidden="true">→</span>}
                  </>
                ) : (
                  <span aria-hidden="true">{isSubmitting ? "…" : ">"}</span>
                )}
              </motion.span>
            </AnimatePresence>
          </button>
        </div>

        <div className="auth-google-slot" aria-hidden={isSignup}>
          <button
              className="oauth-button google-login-button"
              type="button"
              onClick={handleGoogleLogin}
              disabled={isSubmitting || isSignup}
              aria-label="구글로 로그인"
              tabIndex={isSignup ? -1 : 0}
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
      </div>
    </form>
  );
}
