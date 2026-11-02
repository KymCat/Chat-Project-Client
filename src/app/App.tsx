import { Navigate, Route, Routes } from "react-router-dom";
import { AuthRouteLayout } from "../features/auth/AuthScene";
import { ChatPage } from "../pages/ChatPage";
import { InviteJoinPage } from "../pages/InviteJoinPage";
import { OAuthCallbackPage } from "../pages/OAuthCallbackPage";
import { PrivacyPage } from "../pages/PrivacyPage";
import { ProtectedRoute, PublicOnlyRoute } from "./RouteGuards";

export function App() {
  return (
    <Routes>
      <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route element={<PublicOnlyRoute />}>
        <Route element={<AuthRouteLayout />}>
          <Route path="/login" />
          <Route path="/signup" />
        </Route>
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/invite/:token" element={<InviteJoinPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/chat" replace />} />
    </Routes>
  );
}
