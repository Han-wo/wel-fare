import { ofetch } from 'ofetch';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export const api = ofetch.create({
  baseURL: `${BASE_URL}/api/v1`,
  credentials: 'include',
  onRequest({ options }) {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    if (token) {
      options.headers = {
        ...options.headers,
        Authorization: `Bearer ${token}`,
      } as HeadersInit;
    }
  },
  onResponseError({ response }) {
    if (response.status === 401 && typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  },
});
