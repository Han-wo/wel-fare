const REFRESH_COOKIE_NAME = 'welfare_refresh_token';
const REFRESH_COOKIE_PATH = '/api/v1/auth';
const REFRESH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function buildCookieParts(
  value: string,
  options: {
    secure: boolean;
    maxAgeSeconds: number;
  },
) {
  const parts = [
    `${REFRESH_COOKIE_NAME}=${encodeURIComponent(value)}`,
    'HttpOnly',
    `Path=${REFRESH_COOKIE_PATH}`,
    'SameSite=Lax',
    `Max-Age=${options.maxAgeSeconds}`,
  ];

  if (options.secure) {
    parts.push('Secure');
  }

  return parts;
}

export function buildRefreshTokenSetCookie(refreshToken: string, secure: boolean) {
  return buildCookieParts(refreshToken, {
    secure,
    maxAgeSeconds: REFRESH_COOKIE_MAX_AGE_SECONDS,
  }).join('; ');
}

export function buildRefreshTokenClearCookie(secure: boolean) {
  return buildCookieParts('', {
    secure,
    maxAgeSeconds: 0,
  }).join('; ');
}

export function extractRefreshTokenFromCookieHeader(cookieHeader?: string | null) {
  if (!cookieHeader) return null;

  for (const segment of cookieHeader.split(';')) {
    const [rawKey, ...rawValue] = segment.trim().split('=');
    if (rawKey !== REFRESH_COOKIE_NAME) continue;
    const value = rawValue.join('=').trim();
    if (!value) return null;

    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return null;
}
