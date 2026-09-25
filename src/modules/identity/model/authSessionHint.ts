const LEGACY_AUTH_TOKEN_KEY = 'hs_arena_auth_token';
const AUTH_SESSION_HINT_KEY = 'hs_arena_auth_cookie_hint';

/** A non-authoritative hint: only the server response can grant access. */
export function hasAuthSessionHint(): boolean {
  try {
    sessionStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
    return localStorage.getItem(AUTH_SESSION_HINT_KEY) === '1';
  } catch { return false; }
}

export function markAuthSessionHint(): void {
  try {
    localStorage.setItem(AUTH_SESSION_HINT_KEY, '1');
    sessionStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
  } catch { /* Storage may be disabled. */ }
}

export function clearAuthSessionHint(): void {
  try {
    localStorage.removeItem(AUTH_SESSION_HINT_KEY);
    sessionStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
  } catch { /* Storage may be disabled. */ }
}
