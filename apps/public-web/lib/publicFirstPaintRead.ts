/**
 * A server read that only improves the first paint must never hold the
 * document. It resolves to the parsed JSON, or to `null` when the request
 * fails, answers non-OK or misses the shared deadline; the page then falls
 * back to its client-side request. A late response body is cancelled so the
 * abandoned read does not keep its socket.
 */
export async function readFirstPaintJson(request: () => Promise<Response>, deadline: number): Promise<unknown> {
  let pending: Promise<Response>;
  try {
    pending = request();
  } catch {
    return null;
  }
  const response = await withinDeadline(pending, deadline);
  if (!response) {
    void pending.then(late => late.body?.cancel(), () => undefined);
    return null;
  }
  if (!response.ok) {
    void response.body?.cancel();
    return null;
  }
  return withinDeadline(response.json(), deadline);
}

async function withinDeadline<T>(promise: Promise<T>, deadline: number): Promise<T | null> {
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

/** Budget of every first-paint read of one document, in milliseconds. */
export const FIRST_PAINT_READ_BUDGET_MS = 1500;
