const MAX_HTML_BYTES = 1_500_000;

function probeError(code, stage, message) {
  const error = new Error(message);
  error.code = code;
  error.stage = stage;
  return error;
}

async function boundedHtml(response, signal) {
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > MAX_HTML_BYTES) {
    throw probeError('BODY_TOO_LARGE', 'document', `document exceeds ${MAX_HTML_BYTES} bytes`);
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let html = '';
  try {
    while (true) {
      if (signal?.aborted) throw signal.reason;
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_HTML_BYTES) {
        throw probeError('BODY_TOO_LARGE', 'document', `document exceeds ${MAX_HTML_BYTES} bytes`);
      }
      html += decoder.decode(value, { stream: true });
    }
    return html + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export function createHttpRouteProbe({ baseUrl, timeoutMs, signal, fetchImpl = fetch }) {
  const origin = new URL(baseUrl).origin;
  const attempt = async path => {
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason || probeError('RUN_ABORTED', 'deadline', 'run aborted'));
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => {
      controller.abort(probeError('NAVIGATION_TIMEOUT', 'document', `document timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    try {
      const response = await fetchImpl(new URL(path, origin), {
        redirect: 'follow',
        signal: controller.signal,
        headers: { Accept: 'text/html,application/xhtml+xml' },
      });
      const finalUrl = new URL(response.url || new URL(path, origin));
      if (finalUrl.origin !== origin) throw probeError('CROSS_ORIGIN_REDIRECT', 'document', 'document redirected off origin');
      if (response.status !== 200) throw probeError('HTTP_STATUS', 'document', `document returned HTTP ${response.status}`);
      if (!/text\/html/i.test(response.headers.get('content-type') || '')) {
        throw probeError('CONTENT_TYPE', 'document', 'document response is not HTML');
      }
      const html = await boundedHtml(response, controller.signal);
      if (!/<html[\s>]/i.test(html)) throw probeError('HTML_MARKER', 'document', 'HTML document marker is missing');
      if (/application error|internal server error/i.test(html)) {
        throw probeError('ERROR_DOCUMENT', 'document', 'application error document returned');
      }
    } catch (error) {
      if (error?.code) throw error;
      if (controller.signal.aborted) {
        const reason = controller.signal.reason;
        if (reason?.code) throw reason;
        throw probeError('NAVIGATION_TIMEOUT', 'document', reason?.message || 'document request aborted');
      }
      throw probeError('NETWORK_ERROR', 'document', error?.message || 'document request failed');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  };
  return async path => {
    try {
      return await attempt(path);
    } catch (error) {
      if (signal?.aborted || !['NETWORK_ERROR', 'NAVIGATION_TIMEOUT'].includes(error?.code)) throw error;
      return attempt(path);
    }
  };
}
