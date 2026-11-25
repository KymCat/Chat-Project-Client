import "./styles/global.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./app/App";
import { AuthProvider } from "./app/AuthProvider";
import { redirectToCanonicalDevelopmentOrigin } from "./shared/config/env";
import { ModalHistoryProvider } from "./shared/ui/TerminalModalTransition";

if (!redirectToCanonicalDevelopmentOrigin()) {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <BrowserRouter>
        <ModalHistoryProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ModalHistoryProvider>
      </BrowserRouter>
    </StrictMode>,
  );
}
