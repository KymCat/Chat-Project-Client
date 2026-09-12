import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthProvider";

function LoadingScreen() {
  return (
    <main className="loading-screen" aria-live="polite">
      <img className="brand-logo" src="/veritas-logo.png" alt="Veritas" />
      <p>세션을 확인하고 있습니다.</p>
    </main>
  );
}

export function ProtectedRoute() {
  const { accessToken, isBootstrapping } = useAuth();

  if (isBootstrapping) return <LoadingScreen />;
  return accessToken ? <Outlet /> : <Navigate to="/login" replace />;
}

export function PublicOnlyRoute() {
  const { accessToken, isBootstrapping } = useAuth();

  if (isBootstrapping) return <LoadingScreen />;
  return accessToken ? <Navigate to="/chat" replace /> : <Outlet />;
}
