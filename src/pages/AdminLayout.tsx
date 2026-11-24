import { useEffect, useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../app/AuthProvider";
import { connectAuthEvents } from "../features/auth/stompClient";
import { ADMIN_REPORTS_PATH } from "../features/admin/routes";
import "../styles/admin.css";

export function AdminLayout() {
  const { accessToken, forceLogout } = useAuth();
  const [connectionError, setConnectionError] = useState("");

  useEffect(() => {
    if (!accessToken) return;

    const connection = connectAuthEvents({
      accessToken,
      onForceLogout: forceLogout,
      onError: setConnectionError,
    });

    return () => connection.disconnect();
  }, [accessToken, forceLogout]);

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="admin-command">$ admin --reports</p>
          <h1>신고 관리</h1>
        </div>
        <nav aria-label="관리자 메뉴">
          <Link to={ADMIN_REPORTS_PATH}>신고 목록</Link>
          <Link to="/chat">채팅으로 돌아가기</Link>
        </nav>
      </header>
      {connectionError && (
        <p className="admin-alert is-error" role="alert">{connectionError}</p>
      )}
      <Outlet />
    </div>
  );
}

