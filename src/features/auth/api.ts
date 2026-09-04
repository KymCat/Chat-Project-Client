import { httpClient } from "../../shared/api/httpClient";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SignupRequest extends LoginRequest {
  nickname: string;
  profileImageUrl: string | null;
}

export const authApi = {
  login: (request: LoginRequest) =>
    httpClient.post<string>("/auth/login", request, { authenticated: false }),
  signup: (request: SignupRequest) =>
    httpClient.post<unknown>("/member/signup", request, { authenticated: false }),
  logout: () =>
    httpClient.post<unknown>("/auth/logout", undefined, {
      retryOnUnauthorized: true,
    }),
};
