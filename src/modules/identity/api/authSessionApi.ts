import type { AuthUser } from '../model/authUser';

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

// Profile parsing stays out of the eager shell, but in a browser its chunk
// starts loading with the shell, so an early session answer does not wait
// for it after hydration.
let authUserModel: Promise<typeof import('../model/authUser')> | null = null;
function loadAuthUserModel() {
  authUserModel ??= import('../model/authUser').catch(error => {
    authUserModel = null;
    throw error;
  });
  return authUserModel;
}
if (typeof window !== 'undefined') loadAuthUserModel().catch(() => { /* Loaded again on first use. */ });

type EarlyAuthResponse = { at: number; response: Promise<Response | null> };
const EARLY_RESPONSE_MAX_AGE_MS = 10_000;

/**
 * Takes the session response that the document head started
 * (apps/public-web/lib/authPrefetch.ts). A body can be read once, so the first
 * check removes it, and an old one is dropped instead of adopted.
 */
function takeEarlyAuthResponse(): Promise<Response | null> | null {
  const holder = globalThis as { __hpAuthMe?: EarlyAuthResponse };
  const early = holder.__hpAuthMe;
  if (!early) return null;
  delete holder.__hpAuthMe;
  return performance.now() - early.at <= EARLY_RESPONSE_MAX_AGE_MS ? early.response : null;
}

function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('Aborted', 'AbortError'));
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
    promise.then(value => {
      signal.removeEventListener('abort', abort);
      resolve(value);
    }, error => {
      signal.removeEventListener('abort', abort);
      reject(error);
    });
  });
}

async function requestCurrentAuthUser(signal: AbortSignal, early: Promise<Response | null> | null): Promise<AuthUser | null> {
  const [response, { authErrorFromPayload, authSessionFromPayload }] = await Promise.all([
    early ? untilAborted(early, signal)
      : fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store', signal }),
    loadAuthUserModel(),
  ]);
  if (!response) throw new Error('Не удалось проверить текущую сессию');
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
  // The head's early response, when there is one, is the first attempt.
  const early = takeEarlyAuthResponse();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await requestCurrentAuthUser(signal, attempt === 0 ? early : null);
    } catch (error) {
      if (signal.aborted) throw error;
      lastError = error;
      if (attempt < 2) await abortableDelay(350 * (attempt + 1), signal);
    }
  }
  throw lastError;
}
