import { type FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../app/AuthProvider";
import { ApiError } from "../../shared/api/httpClient";
import { authApi } from "./api";

const RESEND_COOLDOWN_SECONDS = 60;

export function EmailVerificationPanel() {
  const { refreshSession } = useAuth();
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isRequesting, setIsRequesting] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;

    const timer = window.setInterval(() => {
      setCooldown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [cooldown]);

  const handleRequest = async () => {
    setError("");
    setMessage("");
    setIsRequesting(true);

    try {
      await authApi.requestEmailVerification();
      setMessage("인증 메일을 발송했습니다. Mailpit에서 코드를 확인하세요.");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsRequesting(false);
    }
  };

  const handleConfirm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!/^\d{6}$/.test(code)) {
      setError("인증 코드는 6자리 숫자여야 합니다.");
      return;
    }

    setIsConfirming(true);

    try {
      await authApi.confirmEmailVerification({ code });
      await refreshSession();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <section className="email-verification" aria-labelledby="email-verification-title">
      <div className="email-verification-copy">
        <p className="eyebrow">EMAIL VERIFICATION</p>
        <h2 id="email-verification-title">이메일을 인증해주세요.</h2>
        <p>인증 메일을 요청하고 전달받은 6자리 코드를 입력하세요.</p>
      </div>

      <button
        className="verification-request-button"
        type="button"
        disabled={isRequesting || cooldown > 0}
        onClick={() => void handleRequest()}
      >
        {isRequesting
          ? "발송 중..."
          : cooldown > 0
            ? `${cooldown}초 후 재발송`
            : "인증 메일 발송"}
      </button>

      <form className="verification-code-form" onSubmit={handleConfirm}>
        <label className="sr-only" htmlFor="email-verification-code">
          이메일 인증 코드
        </label>
        <input
          id="email-verification-code"
          type="text"
          value={code}
          onChange={(event) => {
            const nextCode = event.target.value.replace(/\D/g, "").slice(0, 6);
            setCode(nextCode);
          }}
          placeholder="6자리 인증 코드"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
        />
        <button type="submit" disabled={isConfirming || code.length !== 6}>
          {isConfirming ? "확인 중..." : "인증 확인"}
        </button>
      </form>

      {message && <p className="verification-message" role="status">{message}</p>}
      {error && <p className="verification-error" role="alert">{error}</p>}
    </section>
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : "서버에 연결할 수 없습니다.";
}
