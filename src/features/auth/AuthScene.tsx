import type { PropsWithChildren } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

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

      <section className="auth-card">
        <div className="auth-card-brand">
          <span className="brand-mark">S</span>
          <div>
            <strong>SIGNAL CHAT</strong>
            <small>CONNECT TO THE WORLD</small>
          </div>
        </div>

        <nav className="auth-tabs" aria-label="인증 메뉴">
          <Link className={mode === "login" ? "active" : ""} to="/login">
            로그인
          </Link>
          <Link className={mode === "signup" ? "active" : ""} to="/signup">
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
