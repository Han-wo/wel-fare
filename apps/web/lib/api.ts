import { ofetch } from 'ofetch';
import type { FetchOptions } from 'ofetch';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

const _api = ofetch.create({
  baseURL: `${BASE_URL}/api/v1`,
  credentials: 'include',
  onRequest({ options }) {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    if (token) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      options.headers = { ...(options.headers as any), Authorization: `Bearer ${token}` };
    }
  },
});

let _refreshing: Promise<string> | null = null;

async function tryRefresh(): Promise<string> {
  if (_refreshing) return _refreshing;

  _refreshing = (async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) throw new Error('no_refresh_token');

    const data = await ofetch<{ accessToken: string; refreshToken: string }>(
      `${BASE_URL}/api/v1/auth/refresh`,
      { method: 'POST', body: { refreshToken } },
    );

    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    return data.accessToken;
  })().finally(() => { _refreshing = null; });

  return _refreshing;
}

export async function api<T = unknown>(url: string, options?: FetchOptions<'json'>): Promise<T> {
  try {
    return await _api<T>(url, options);
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;

    if (status === 401 && typeof window !== 'undefined') {
      try {
        const newToken = await tryRefresh();
        return await _api<T>(url, {
          ...options,
          headers: {
            ...(options?.headers ?? {}),
            Authorization: `Bearer ${newToken}`,
          } as HeadersInit,
        });
      } catch {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
      }
    }

    throw err;
  }
}
