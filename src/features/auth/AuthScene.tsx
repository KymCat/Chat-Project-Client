import { type MouseEvent, type PropsWithChildren, useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";

const greetings = [
  "Hello", "안녕하세요", "Bonjour", "Hola", "こんにちは", "Ciao",
  "Olá", "你好", "Guten Tag", "नमस्ते", "Merhaba", "مرحبا",
  "Hej", "Xin chào", "สวัสดี", "Привет", "Shalom", "Selamat",
  "Kia ora", "Kamusta", "Γεια σου", "Ahoj", "Szia", "Halo",
  "Sawubona", "Tere", "Sveiki", "Dzień dobry", "Salut", "Goedendag",
  "Jambo", "Halló", "Bună ziua", "Moi", "Добрий день", "გამარჯობა",
  "Mingalaba", "Salam", "Përshëndetje", "Kaixo", "Բարեւ", "Habari",
];

const rowOrders = [
  { offset: 0, step: 1 },
  { offset: 3, step: 5 },
  { offset: 7, step: 11 },
  { offset: 13, step: 13 },
  { offset: 19, step: 17 },
  { offset: 23, step: 19 },
  { offset: 29, step: 25 },
];

const greetingRows = rowOrders.map(({ offset, step }) =>
  Array.from(
    { length: greetings.length },
    (_, index) => greetings[(offset + index * step) % greetings.length],
  ),
);

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
    <main className="auth-scene">
      <div className="auth-greetings" aria-hidden="true">
        {greetingRows.map((row, rowIndex) => {
          return (
            <div className="greeting-row" key={rowIndex}>
              <div className="greeting-track">
                {[0, 1].map((copyIndex) => (
                  <div className="greeting-group" key={copyIndex}>
                    {row.map((greeting, index) => (
                      <span key={`${greeting}-${index}`}>{greeting}</span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <section
        className={isTransitioning ? "auth-card auth-card-transitioning" : "auth-card"}
        onClickCapture={handleRouteChange}
      >
        <div className="auth-card-brand">
          <img className="brand-logo" src="/veritas-logo.png" alt="Veritas" />
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
