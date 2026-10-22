import {
  useEffect,
  useRef,
  useState,
} from "react";
import { MotionConfig } from "motion/react";
import { Link, useLocation } from "react-router-dom";
import { AuthForm } from "./AuthForm";

interface AuthSceneProps {
  mode: "login" | "signup";
}

const BRAND_LABELS = ["베리타스", "Veritas", "ヴェリタス"] as const;
const SCRAMBLE_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789가나다라마바사アイウエオ";
const SCRAMBLE_DURATION_MS = 480;
const AUTH_LAYOUT_TRANSITION = {
  duration: 0.38,
  ease: [0.22, 1, 0.36, 1],
} as const;

export function AuthScene({ mode }: AuthSceneProps) {
  const [brandIndex, setBrandIndex] = useState(0);
  const [brandText, setBrandText] = useState<string>(BRAND_LABELS[0]);
  const [isScrambling, setIsScrambling] = useState(false);
  const scrambleFrameRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (scrambleFrameRef.current !== null) {
      window.cancelAnimationFrame(scrambleFrameRef.current);
    }
  }, []);

  const handleBrandClick = () => {
    const nextIndex = (brandIndex + 1) % BRAND_LABELS.length;
    const nextLabel = BRAND_LABELS[nextIndex];

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setBrandIndex(nextIndex);
      setBrandText(nextLabel);
      return;
    }

    if (scrambleFrameRef.current !== null) {
      window.cancelAnimationFrame(scrambleFrameRef.current);
    }

    setBrandIndex(nextIndex);
    setIsScrambling(true);
    const startedAt = performance.now();

    const renderFrame = (now: number) => {
      const progress = Math.min((now - startedAt) / SCRAMBLE_DURATION_MS, 1);
      const revealedCharacters = Math.floor(progress * nextLabel.length);

      setBrandText(
        Array.from(nextLabel, (character, index) => {
          if (index < revealedCharacters || character === " ") return character;
          const randomIndex = Math.floor(Math.random() * SCRAMBLE_CHARACTERS.length);
          return SCRAMBLE_CHARACTERS[randomIndex];
        }).join(""),
      );

      if (progress < 1) {
        scrambleFrameRef.current = window.requestAnimationFrame(renderFrame);
        return;
      }

      scrambleFrameRef.current = null;
      setBrandText(nextLabel);
      setIsScrambling(false);
    };

    scrambleFrameRef.current = window.requestAnimationFrame(renderFrame);
  };

  return (
    <main className="auth-scene">
      <section className="auth-card">
        <button
          className={isScrambling ? "auth-wordmark is-scrambling" : "auth-wordmark"}
          type="button"
          onClick={handleBrandClick}
          aria-label={`브랜드 언어 변경, 현재 ${BRAND_LABELS[brandIndex]}`}
        >
          <span data-text={brandText} aria-hidden="true">{brandText}</span>
        </button>

        <nav className="auth-tabs" aria-label="인증 메뉴">
          <span
            className={mode === "login" ? "auth-tab-indicator" : "auth-tab-indicator signup"}
            aria-hidden="true"
          />
          <Link
            className={mode === "login" ? "active" : ""}
            to="/login"
            aria-label="로그인"
            aria-current={mode === "login" ? "page" : undefined}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M10 5H6.8A1.8 1.8 0 0 0 5 6.8v10.4A1.8 1.8 0 0 0 6.8 19H10M14 8l4 4-4 4m4-4H9" />
            </svg>
            <span className="auth-tooltip" role="tooltip">로그인</span>
          </Link>
          <Link
            className={mode === "signup" ? "active" : ""}
            to="/signup"
            aria-label="회원가입"
            aria-current={mode === "signup" ? "page" : undefined}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="9" cy="8" r="3" />
              <path d="M3.5 19c.5-3.2 2.3-5 5.5-5s5 1.8 5.5 5M18 8v6M15 11h6" />
            </svg>
            <span className="auth-tooltip" role="tooltip">회원가입</span>
          </Link>
        </nav>

        <MotionConfig reducedMotion="user" transition={AUTH_LAYOUT_TRANSITION}>
          <div className="auth-view">
            <AuthForm mode={mode} />
          </div>
        </MotionConfig>
      </section>
    </main>
  );
}

export function AuthRouteLayout() {
  const { pathname } = useLocation();
  const mode = pathname === "/signup" ? "signup" : "login";

  return <AuthScene mode={mode} />;
}
