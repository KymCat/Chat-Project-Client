import { Navigate, Route, Routes } from "react-router-dom";
import { AuthRouteLayout } from "../features/auth/AuthScene";
import { ChatPage } from "../pages/ChatPage";
import { LoginPage } from "../pages/LoginPage";
import { OAuthCallbackPage } from "../pages/OAuthCallbackPage";
import { SignupPage } from "../pages/SignupPage";
import { ProtectedRoute, PublicOnlyRoute } from "./RouteGuards";

export function App() {
  return (
    <Routes>
      <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
      <Route element={<PublicOnlyRoute />}>
        <Route element={<AuthRouteLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
        </Route>
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route path="/chat" element={<ChatPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/chat" replace />} />
    </Routes>
  );
}
