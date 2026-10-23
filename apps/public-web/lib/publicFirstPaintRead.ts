/**
 * A server read that only improves the first paint must never hold the
 * document. It resolves to the parsed JSON, or to `null` when the request
 * fails, answers non-OK or misses the shared deadline; the page then falls
 * back to its client-side request. A late response body is cancelled so the
 * abandoned read does not keep its socket. Forward the supplied signal to
 * the request to cancel it before headers arrive or while JSON is streaming.
 */
export async function readFirstPaintJson(request: (signal: AbortSignal) => Promise<Response>, deadline: number): Promise<unknown> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return null;
  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), remaining);
  try {
    const pending = request(controller.signal);
    const response = await withinDeadline(pending, deadline);
    if (!response) {
      void pending.then(late => late.body?.cancel(), () => undefined).catch(() => undefined);
      return null;
    }
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      return null;
    }
    return await withinDeadline(response.json(), deadline);
  } catch {
    return null;
  } finally {
    clearTimeout(abortTimer);
    controller.abort();
  }
}

/** The promise's value, or `null` once the deadline passes or it rejects; the promise itself keeps running. */
export async function withinDeadline<T>(promise: Promise<T>, deadline: number): Promise<T | null> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    promise.catch(() => undefined);
    return null;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>(resolve => { timer = setTimeout(resolve, remaining, null); }),
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Total wait for the first-paint reads of one document, in milliseconds.
 * Nothing streams before them, so this is also the most the header can be
 * delayed; a slower Express leaves the data to the browser request instead.
 */
export const FIRST_PAINT_READ_BUDGET_MS = 600;
