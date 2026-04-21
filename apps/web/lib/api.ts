import { ofetch } from 'ofetch';
import type { FetchOptions } from 'ofetch';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const ACCESS_TOKEN_KEY = 'accessToken';
const LEGACY_REFRESH_TOKEN_KEY = 'refreshToken';

function canUseBrowserStorage() {
  return typeof window !== 'undefined';
}

function readAccessToken() {
  if (!canUseBrowserStorage()) return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

function buildAuthHeaders(headers: HeadersInit | undefined, token: string | null) {
  const nextHeaders = new Headers(headers ?? undefined);
  if (token) {
    nextHeaders.set('Authorization', `Bearer ${token}`);
  }
  return nextHeaders;
}

export function persistAccessToken(accessToken: string) {
  if (!canUseBrowserStorage()) return;
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
}

export function clearClientAuthStorage() {
  if (!canUseBrowserStorage()) return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
}

const _api = ofetch.create({
  baseURL: `${BASE_URL}/api/v1`,
  credentials: 'include',
  onRequest({ options }) {
    options.headers = buildAuthHeaders(options.headers as HeadersInit | undefined, readAccessToken());
  },
});

let _refreshing: Promise<string> | null = null;

async function tryRefresh(): Promise<string> {
  if (_refreshing) return _refreshing;

  _refreshing = (async () => {
    const data = await ofetch<{ accessToken: string }>(
      `${BASE_URL}/api/v1/auth/refresh`,
      {
        method: 'POST',
        credentials: 'include',
      },
    );

    persistAccessToken(data.accessToken);
    return data.accessToken;
  })().finally(() => {
    _refreshing = null;
  });

  return _refreshing;
}

export async function api<T = unknown>(url: string, options?: FetchOptions<'json'>): Promise<T> {
  try {
    return await _api<T>(url, options);
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;

    if (status === 401 && canUseBrowserStorage()) {
      try {
        const newToken = await tryRefresh();
        return await _api<T>(url, {
          ...options,
          headers: buildAuthHeaders(options?.headers as HeadersInit | undefined, newToken),
        });
      } catch {
        clearClientAuthStorage();
        window.location.href = '/login';
      }
    }

    throw err;
  }
}

export async function fetchWithAuth(input: string, init?: RequestInit): Promise<Response> {
  const execute = async (token: string | null) =>
    fetch(input, {
      ...init,
      credentials: 'include',
      headers: buildAuthHeaders(init?.headers, token),
    });

  const response = await execute(readAccessToken());
  if (response.status !== 401 || !canUseBrowserStorage()) {
    return response;
  }

  try {
    const nextToken = await tryRefresh();
    return await execute(nextToken);
  } catch {
    clearClientAuthStorage();
    window.location.href = '/login';
    return response;
  }
}

export async function logoutRequest() {
  try {
    await ofetch(`${BASE_URL}/api/v1/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: buildAuthHeaders(undefined, readAccessToken()),
    });
  } catch {
    // ignore logout failures and clear local state anyway
  } finally {
    clearClientAuthStorage();
  }
}
