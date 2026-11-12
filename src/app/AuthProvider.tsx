import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useLocation } from "react-router-dom";
import { authApi, type LoginRequest, type SignupRequest } from "../features/auth/api";
import {
  clearLogoutAllNotice,
  saveAccountWithdrawnNotice,
  saveLogoutAllNotice,
} from "../features/auth/notice";
import { memberApi } from "../features/member/api";
import {
  refreshAccessToken,
  setAccessToken as saveAccessToken,
} from "../shared/api/httpClient";

interface AuthContextValue {
  accessToken: string | null;
  isBootstrapping: boolean;
  isLoginTransitionPending: boolean;
  login: (request: LoginRequest) => Promise<void>;
  signup: (request: SignupRequest) => Promise<void>;
  logout: () => Promise<void>;
  logoutAllSessions: (reauthenticationToken: string) => Promise<void>;
  completeSocialLogoutAll: (code: string) => Promise<void>;
  withdrawAccount: (reauthenticationToken: string) => Promise<void>;
  completeSocialWithdrawal: (code: string) => Promise<void>;
  forceLogout: () => void;
  refreshSession: () => Promise<void>;
  completeOAuthLogin: (code: string) => Promise<void>;
  completeLoginTransition: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const { pathname } = useLocation();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isLoginTransitionPending, setIsLoginTransitionPending] = useState(false);

  const clearAuthentication = useCallback(() => {
    saveAccessToken(null);
    setAccessToken(null);
    setIsLoginTransitionPending(false);
  }, []);

  useEffect(() => {
    if (pathname === "/oauth/callback") {
      setIsBootstrapping(false);
      return;
    }

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
      isLoginTransitionPending,
      login: async (request) => {
        const token = await authApi.login(request);
        saveAccessToken(token);
        setAccessToken(token);
        setIsLoginTransitionPending(true);
      },
      signup: async (request) => {
        await authApi.signup(request);
      },
      logout: async () => {
        try {
          await authApi.logout();
        } finally {
          clearAuthentication();
        }
      },
      logoutAllSessions: async (reauthenticationToken) => {
        saveLogoutAllNotice();
        try {
          await authApi.logoutAllSessions(reauthenticationToken);
        } catch (error) {
          clearLogoutAllNotice();
          throw error;
        }
        clearAuthentication();
      },
      completeSocialLogoutAll: async (code) => {
        await refreshAccessToken();
        const reauthenticationToken =
          await authApi.exchangeSocialReauthenticationCode(code);
        saveLogoutAllNotice();
        try {
          await authApi.logoutAllSessions(reauthenticationToken);
        } catch (error) {
          clearLogoutAllNotice();
          throw error;
        }
        clearAuthentication();
      },
      withdrawAccount: async (reauthenticationToken) => {
        saveAccountWithdrawnNotice();
        try {
          await memberApi.withdrawAccount(reauthenticationToken);
        } catch (error) {
          clearLogoutAllNotice();
          throw error;
        }
        clearAuthentication();
      },
      completeSocialWithdrawal: async (code) => {
        await refreshAccessToken();
        const reauthenticationToken =
          await authApi.exchangeSocialReauthenticationCode(code);
        saveAccountWithdrawnNotice();
        try {
          await memberApi.withdrawAccount(reauthenticationToken);
        } catch (error) {
          clearLogoutAllNotice();
          throw error;
        }
        clearAuthentication();
      },
      forceLogout: () => {
        saveLogoutAllNotice();
        clearAuthentication();
      },
      refreshSession: async () => {
        const token = await refreshAccessToken();
        setAccessToken(token);
      },
      completeOAuthLogin: async (code) => {
        const token = await authApi.exchangeOAuthLoginCode({ code });
        saveAccessToken(token);
        setAccessToken(token);
        setIsLoginTransitionPending(true);
      },
      completeLoginTransition: () => setIsLoginTransitionPending(false),
    }),
    [accessToken, clearAuthentication, isBootstrapping, isLoginTransitionPending],
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
