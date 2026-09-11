const COVER_SSO_START_PATH = '/api/auth/cover/start';

/** Resume only the fixed server-side Cover hand-off after an interactive login. */
export function continueToCoverAfterLogin(): void {
  const returnTo = new URLSearchParams(window.location.search).get('returnTo');
  if (returnTo === COVER_SSO_START_PATH) window.location.assign(returnTo);
}

export function coverSsoReturnTo(): string {
  return new URLSearchParams(window.location.search).get('returnTo') === COVER_SSO_START_PATH ? COVER_SSO_START_PATH : '';
}
