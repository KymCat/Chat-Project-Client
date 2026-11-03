import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthRouteLayout } from "../features/auth/AuthScene";
import { InviteJoinPage } from "../pages/InviteJoinPage";
import { OAuthCallbackPage } from "../pages/OAuthCallbackPage";
import { PrivacyPage } from "../pages/PrivacyPage";
import { LoadingScreen, ProtectedRoute, PublicOnlyRoute } from "./RouteGuards";

const ChatPage = lazy(() => import("../pages/ChatPage").then((module) => ({
  default: module.ChatPage,
})));

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
        <Route
          path="/chat"
          element={(
            <Suspense fallback={<LoadingScreen />}>
              <ChatPage />
            </Suspense>
          )}
        />
        <Route path="/invite/:token" element={<InviteJoinPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/chat" replace />} />
    </Routes>
  );
}
