import { API_BASE_URL } from "../config/env";

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

interface RequestOptions extends RequestInit {
  authenticated?: boolean;
  retryOnUnauthorized?: boolean;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let accessToken: string | null = null;
let refreshPromise: Promise<string> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as ApiResponse<T> | null;

  if (!response.ok || body?.success === false) {
    throw new ApiError(
      response.status,
      body?.message || "요청을 처리하지 못했습니다.",
    );
  }

  if (!body) {
    throw new ApiError(response.status, "서버 응답 형식이 올바르지 않습니다.");
  }

  return body.data;
}

async function send<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const shouldAttachToken = options.authenticated !== false;

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (shouldAttachToken && accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (
    response.status === 401 &&
    shouldAttachToken &&
    options.retryOnUnauthorized !== false
  ) {
    const token = await refreshAccessToken();
    headers.set("Authorization", `Bearer ${token}`);

    const retriedResponse = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      credentials: "include",
    });

    return readResponse<T>(retriedResponse);
  }

  return readResponse<T>(response);
}

export function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = send<string>("/auth/reissue", {
      method: "POST",
      authenticated: false,
      retryOnUnauthorized: false,
    })
      .then((token) => {
        setAccessToken(token);
        return token;
      })
      .catch((error) => {
        setAccessToken(null);
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

export const httpClient = {
  get: <T>(path: string, options?: RequestOptions) =>
    send<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    send<T>(path, {
      ...options,
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  delete: <T>(path: string, options?: RequestOptions) =>
    send<T>(path, { ...options, method: "DELETE" }),
};
