import { type MouseEvent, type PropsWithChildren, useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";

interface AuthSceneProps extends PropsWithChildren {
  mode: "login" | "signup";
}

export function AuthScene({ mode, children }: AuthSceneProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const routeChangeTimerRef = useRef<number | null>(null);
  const routeRevealTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (routeChangeTimerRef.current !== null) {
      window.clearTimeout(routeChangeTimerRef.current);
    }
    if (routeRevealTimerRef.current !== null) {
      window.clearTimeout(routeRevealTimerRef.current);
    }
  }, []);

  const handleRouteChange = (event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    const link = target.closest<HTMLAnchorElement>("a[href]");
    const targetPath = link?.getAttribute("href");

    if (!targetPath?.startsWith("/")) return;
    if (pathname === targetPath) return;

    event.preventDefault();
    if (isTransitioning) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      navigate(targetPath);
      return;
    }

    setIsTransitioning(true);
    routeChangeTimerRef.current = window.setTimeout(() => {
      navigate(targetPath);
      routeRevealTimerRef.current = window.setTimeout(() => {
        setIsTransitioning(false);
      }, 50);
    }, 180);
  };

  return (
    <main className={isTransitioning ? "auth-scene auth-scene-transitioning" : "auth-scene"}>
      <div className="auth-background" aria-hidden="true">
        <div className="auth-grid" />
        <svg
          className="auth-network"
          viewBox="0 0 1200 760"
          preserveAspectRatio="xMidYMid slice"
        >
          <g className="auth-network-lines">
            <path d="M58 170 238 92 402 206 594 118 778 226 1012 126 1150 230" />
            <path d="M84 568 274 476 452 594 650 454 834 574 1108 470" />
            <path d="M238 92 274 476M402 206 452 594M594 118 650 454M778 226 834 574M1012 126 1108 470" />
            <path d="M58 170 84 568M1150 230 1108 470" />
          </g>
          <g className="auth-network-nodes">
            <circle cx="58" cy="170" r="4" />
            <circle cx="238" cy="92" r="5" />
            <circle cx="402" cy="206" r="4" />
            <circle cx="594" cy="118" r="6" />
            <circle cx="778" cy="226" r="4" />
            <circle cx="1012" cy="126" r="5" />
            <circle cx="1150" cy="230" r="4" />
            <circle cx="84" cy="568" r="4" />
            <circle cx="274" cy="476" r="5" />
            <circle cx="452" cy="594" r="4" />
            <circle cx="650" cy="454" r="6" />
            <circle cx="834" cy="574" r="4" />
            <circle cx="1108" cy="470" r="5" />
          </g>
        </svg>
        <div className="auth-scan-line" />
        <span className="auth-telemetry auth-telemetry-primary">
          VERITAS // TRUTH TRACE
        </span>
        <span className="auth-telemetry auth-telemetry-secondary">
          NODE 07 · SECURE CHANNEL
        </span>
        <span className="auth-telemetry auth-telemetry-tertiary">
          PACKET INTEGRITY 100%
        </span>
      </div>

      <section
        className={isTransitioning ? "auth-card auth-card-transitioning" : "auth-card"}
        onClickCapture={handleRouteChange}
      >
        <div className="auth-card-brand">
          <img className="brand-logo auth-logo" src="/veritas-logo.png" alt="Veritas" />
          <div>
            <small>CONNECT TO THE WORLD</small>
          </div>
        </div>

        <nav className="auth-tabs" aria-label="인증 메뉴">
          <Link
            className={mode === "login" ? "active" : ""}
            to="/login"
          >
            로그인
          </Link>
          <Link
            className={mode === "signup" ? "active" : ""}
            to="/signup"
          >
            회원가입
          </Link>
        </nav>

        {children}
      </section>
    </main>
  );
}

export function AuthRouteLayout() {
  const { pathname } = useLocation();
  const mode = pathname === "/signup" ? "signup" : "login";

  return (
    <AuthScene mode={mode}>
      <Outlet />
    </AuthScene>
  );
}
