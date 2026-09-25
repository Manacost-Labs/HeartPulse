import 'server-only';
import { cookies } from 'next/headers';

const sessionCookieNames = ['__Host-manacost_auth_token', 'manacost_auth_token'] as const;

/** Checks the existing Express session without serializing user data into HTML. */
export async function canOpenAdminPage(requiredAccess: 'contest' | 'workspace' = 'contest'): Promise<boolean> {
  const cookieStore = await cookies();
  const sessionCookies = sessionCookieNames.flatMap(name => {
    const value = cookieStore.get(name)?.value;
    return value && value.length <= 512 ? [`${name}=${encodeURIComponent(value)}`] : [];
  });
  if (sessionCookies.length === 0) return false;

  const origin = new URL(process.env.LEGACY_WEB_ORIGIN ?? 'http://127.0.0.1:3001');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)
    || origin.protocol !== 'http:' || origin.username || origin.password || origin.pathname !== '/') {
    throw new Error('Admin session origin must be a loopback HTTP origin');
  }

  const response = await fetch(new URL('/api/auth/me', origin), {
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(5_000),
    headers: { Accept: 'application/json', Cookie: sessionCookies.join('; ') },
  });
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('Admin session check unavailable');
  }
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object') throw new Error('Invalid admin session response');
  const access = payload as { user?: unknown; adminAllowed?: unknown; contestAdminAllowed?: unknown };
  return Boolean(access.user && typeof access.user === 'object'
    && (access.adminAllowed === true
      || (requiredAccess === 'contest' && access.contestAdminAllowed === true)));
}
