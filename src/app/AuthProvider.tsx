import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { authApi, type LoginRequest, type SignupRequest } from "../features/auth/api";
import {
  refreshAccessToken,
  setAccessToken as saveAccessToken,
} from "../shared/api/httpClient";

interface AuthContextValue {
  accessToken: string | null;
  isBootstrapping: boolean;
  login: (request: LoginRequest) => Promise<void>;
  signup: (request: SignupRequest) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  useEffect(() => {
    let active = true;

    refreshAccessToken()
      .then((token) => {
        if (active) setAccessToken(token);
      })
      .catch(() => {
        if (active) setAccessToken(null);
      })
      .finally(() => {
        if (active) setIsBootstrapping(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      accessToken,
      isBootstrapping,
      login: async (request) => {
        const token = await authApi.login(request);
        saveAccessToken(token);
        setAccessToken(token);
      },
      signup: async (request) => {
        await authApi.signup(request);
      },
      logout: async () => {
        try {
          await authApi.logout();
        } finally {
          saveAccessToken(null);
          setAccessToken(null);
        }
      },
      refreshSession: async () => {
        const token = await refreshAccessToken();
        setAccessToken(token);
      },
    }),
    [accessToken, isBootstrapping],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth는 AuthProvider 내부에서 사용해야 합니다.");
  }
  return context;
}
