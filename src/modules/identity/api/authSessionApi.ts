import {
  authErrorFromPayload,
  authSessionFromPayload,
  type AuthUser,
} from '../model/authUser';

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const handleAbort = () => {
      globalThis.clearTimeout(timeout);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timeout = globalThis.setTimeout(() => {
      signal.removeEventListener('abort', handleAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener('abort', handleAbort, { once: true });
  });
}

async function requestCurrentAuthUser(signal: AbortSignal): Promise<AuthUser | null> {
  const response = await fetch('/api/auth/me', {
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(authErrorFromPayload(payload) || 'Не удалось проверить текущую сессию');
  }
  const session = authSessionFromPayload(payload);
  if (!session) throw new Error('Не удалось проверить текущую сессию');
  return session.user;
}

/** Preserves the shell's bounded retry policy for transient session failures. */
export async function fetchCurrentAuthUser(signal: AbortSignal): Promise<AuthUser | null> {
  let lastError: unknown = new Error('Не удалось проверить текущую сессию');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await requestCurrentAuthUser(signal);
    } catch (error) {
      if (signal.aborted) throw error;
      lastError = error;
      if (attempt < 2) await abortableDelay(350 * (attempt + 1), signal);
    }
  }
  throw lastError;
}
