import { httpClient } from "../../shared/api/httpClient";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SignupRequest extends LoginRequest {
  nickname: string;
}

export interface EmailVerificationConfirmRequest {
  code: string;
}

export interface OAuthLoginCodeExchangeRequest {
  code: string;
}

export type ReauthenticationPurpose =
  | "LOGOUT_ALL"
  | "CHANGE_PASSWORD"
  | "WITHDRAW_ACCOUNT";

export type SocialProvider = "GOOGLE";

export interface ReauthenticationMethodResponse {
  type: "PASSWORD" | "SOCIAL";
  provider: SocialProvider | null;
}

export interface ReauthenticationPasswordRequest {
  password: string;
  purpose: ReauthenticationPurpose;
}

export interface SocialReauthenticationStartRequest {
  provider: SocialProvider;
  purpose: ReauthenticationPurpose;
}

export const authApi = {
  login: (request: LoginRequest) =>
    httpClient.post<string>("/auth/login", request, { authenticated: false }),
  exchangeOAuthLoginCode: (request: OAuthLoginCodeExchangeRequest) =>
    httpClient.post<string>("/auth/oauth/exchange", request, {
      authenticated: false,
      retryOnUnauthorized: false,
    }),
  signup: (request: SignupRequest) =>
    httpClient.post<unknown>("/member/signup", request, { authenticated: false }),
  logout: () =>
    httpClient.post<unknown>("/auth/logout", undefined, {
      retryOnUnauthorized: true,
    }),
  getReauthenticationMethod: () =>
    httpClient.get<ReauthenticationMethodResponse>(
      "/auth/reauthentication-method",
    ),
  reauthenticateWithPassword: (request: ReauthenticationPasswordRequest) =>
    httpClient.post<string>("/auth/reauthentication/password", request),
  startSocialReauthentication: (request: SocialReauthenticationStartRequest) =>
    httpClient.post<void>("/auth/reauthentication/social/start", request),
  exchangeSocialReauthenticationCode: (code: string) =>
    httpClient.post<string>(
      "/auth/reauthentication/social/exchange",
      { code },
      {
        authenticated: false,
        retryOnUnauthorized: false,
      },
    ),
  logoutAllSessions: (reauthenticationToken: string) =>
    httpClient.post<void>("/auth/logout/all", undefined, {
      headers: {
        "X-Reauthentication-Token": reauthenticationToken,
      },
      retryOnUnauthorized: false,
    }),
  requestEmailVerification: () =>
    httpClient.post<unknown>("/auth/email-verifications"),
  confirmEmailVerification: (request: EmailVerificationConfirmRequest) =>
    httpClient.post<unknown>("/auth/email-verifications/confirm", request),
};
