import { describe, expect, it } from '@jest/globals';
import {
  buildRefreshTokenClearCookie,
  buildRefreshTokenSetCookie,
  extractRefreshTokenFromCookieHeader,
} from './auth-cookie.util';

describe('auth-cookie.util', () => {
  it('builds and extracts the refresh token cookie value', () => {
    const cookie = buildRefreshTokenSetCookie('refresh.token.value', false);
    const header = `${cookie}; theme=light`;

    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/api/v1/auth');
    expect(extractRefreshTokenFromCookieHeader(header)).toBe('refresh.token.value');
  });

  it('clears the cookie with zero max age', () => {
    expect(buildRefreshTokenClearCookie(false)).toContain('Max-Age=0');
  });
});
