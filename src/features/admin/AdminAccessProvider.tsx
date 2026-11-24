import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { adminApi } from "./api";

type AdminAccessStatus = "checking" | "allowed" | "denied" | "error";

interface AdminAccessContextValue {
  status: AdminAccessStatus;
  isAdmin: boolean;
  retry: () => void;
}

interface AdminAccessProviderProps extends PropsWithChildren {
  accessToken: string;
}

const AdminAccessContext = createContext<AdminAccessContextValue | null>(null);

export function AdminAccessProvider({
  accessToken,
  children,
}: AdminAccessProviderProps) {
  const [status, setStatus] = useState<AdminAccessStatus>("checking");
  const [revision, setRevision] = useState(0);

  const retry = useCallback(() => {
    setStatus("checking");
    setRevision((current) => current + 1);
  }, []);

  useEffect(() => {
    let active = true;
    setStatus("checking");

    adminApi.checkAccess()
      .then((hasAccess) => {
        if (active) setStatus(hasAccess ? "allowed" : "denied");
      })
      .catch(() => {
        if (active) setStatus("error");
      });

    return () => {
      active = false;
    };
  }, [accessToken, revision]);

  const value = useMemo<AdminAccessContextValue>(
    () => ({ status, isAdmin: status === "allowed", retry }),
    [retry, status],
  );

  return (
    <AdminAccessContext.Provider value={value}>
      {children}
    </AdminAccessContext.Provider>
  );
}

export function useAdminAccess() {
  const context = useContext(AdminAccessContext);
  if (!context) {
    throw new Error("useAdminAccess는 AdminAccessProvider 내부에서 사용해야 합니다.");
  }
  return context;
}

