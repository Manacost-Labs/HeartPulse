/**
 * `fetch` with a deadline and readable failures, for the administrator workspace and any other
 * client that must never wait forever. A stalled connection ends with a message a person can act
 * on instead of an endless «Загрузка…», and a request the server refuses for lack of a session is
 * announced once on `window`, so the page can tell the person to sign in again.
 */
import { pluralRu } from '../text/pluralRu';

export const REQUEST_DEADLINE_MS = 20_000;

/** Dispatched on `window` when the server answers 401 or 403. */
export const ACCESS_REJECTED_EVENT = 'hs:access-rejected';

export class RequestDeadlineError extends Error {
  /** A change that timed out may still have been applied, so the person is told to look before repeating it. */
  constructor(seconds: number, change = false) {
    const waited = `Сервер не ответил за ${seconds} ${pluralRu(seconds, 'секунду', 'секунды', 'секунд')}.`;
    super(change
      ? `${waited} Изменение могло сохраниться: обновите данные, прежде чем повторять.`
      : `${waited} Проверьте соединение и повторите.`);
    this.name = 'RequestDeadlineError';
  }
}

export class RequestNetworkError extends Error {
  constructor() {
    super('Нет соединения с сервером. Проверьте интернет и повторите.');
    this.name = 'RequestNetworkError';
  }
}

export type DeadlineRequestInit = RequestInit & { deadlineMs?: number };

/** True for the TypeError browsers raise when no response arrives, not for a programming error. */
const isNetworkFailure = (error: unknown) => error instanceof TypeError && /fetch|network|load failed/i.test(error.message);

/**
 * The deadline and the caller's cancellation cover the whole exchange, body included: a response
 * whose body stalls is cut off like one whose headers never arrive, and reading a cancelled
 * response rejects. The timer is left to expire on its own after a successful exchange.
 */
export async function fetchWithDeadline(input: string, init: DeadlineRequestInit = {}): Promise<Response> {
  const { deadlineMs = REQUEST_DEADLINE_MS, signal: callerSignal, ...rest } = init;
  const change = !['GET', 'HEAD'].includes(String(rest.method ?? 'GET').toUpperCase());
  const seconds = Math.max(1, Math.round(deadlineMs / 1000));
  const controller = new AbortController();
  // Aborting with the error itself makes a stalled body read reject with the same readable message.
  const timer = setTimeout(() => controller.abort(new RequestDeadlineError(seconds, change)), deadlineMs);
  (timer as { unref?: () => void }).unref?.();
  const forwardAbort = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) forwardAbort();
  else callerSignal?.addEventListener('abort', forwardAbort, { once: true });
  try {
    const response = await fetch(input, { credentials: 'same-origin', ...rest, signal: controller.signal });
    if ((response.status === 401 || response.status === 403) && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(ACCESS_REJECTED_EVENT, { detail: { status: response.status, url: input } }));
    }
    return response;
  } catch (error) {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', forwardAbort);
    if (callerSignal?.aborted) throw error;
    if (controller.signal.reason instanceof RequestDeadlineError) throw controller.signal.reason;
    if (isNetworkFailure(error)) throw new RequestNetworkError();
    throw error;
  }
}
