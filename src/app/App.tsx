import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthRouteLayout } from "../features/auth/AuthScene";
import { InviteJoinPage } from "../pages/InviteJoinPage";
import { OAuthCallbackPage } from "../pages/OAuthCallbackPage";
import { PrivacyPage } from "../pages/PrivacyPage";
import { ADMIN_CONSOLE_PATH } from "../features/admin/routes";
import {
  AdminRoute,
  LoadingScreen,
  ProtectedRoute,
  PublicOnlyRoute,
} from "./RouteGuards";

const ChatPage = lazy(() => import("../pages/ChatPage").then((module) => ({
  default: module.ChatPage,
})));

const AccountSettingsPage = lazy(() =>
  import("../pages/AccountSettingsPage").then((module) => ({
    default: module.AccountSettingsPage,
  })),
);

const AdminLayout = lazy(() => import("../pages/AdminLayout").then((module) => ({
  default: module.AdminLayout,
})));

const AdminReportListPage = lazy(() =>
  import("../pages/AdminReportListPage").then((module) => ({
    default: module.AdminReportListPage,
  })),
);

const AdminReportDetailPage = lazy(() =>
  import("../pages/AdminReportDetailPage").then((module) => ({
    default: module.AdminReportDetailPage,
  })),
);

function LegacyAdminRedirect() {
  const location = useLocation();
  const suffix = location.pathname.slice("/management".length);

  return (
    <Navigate
      to={`${ADMIN_CONSOLE_PATH}${suffix}${location.search}`}
      replace
    />
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/management/*" element={<LegacyAdminRedirect />} />
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
        <Route
          path="/settings/account"
          element={(
            <Suspense fallback={<LoadingScreen />}>
              <AccountSettingsPage />
            </Suspense>
          )}
        />
        <Route element={<AdminRoute />}>
          <Route
            path={ADMIN_CONSOLE_PATH}
            element={(
              <Suspense fallback={<LoadingScreen />}>
                <AdminLayout />
              </Suspense>
            )}
          >
            <Route index element={<Navigate to="reports" replace />} />
            <Route path="reports" element={<AdminReportListPage />} />
            <Route path="reports/:reportId" element={<AdminReportDetailPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/chat" replace />} />
    </Routes>
  );
}
