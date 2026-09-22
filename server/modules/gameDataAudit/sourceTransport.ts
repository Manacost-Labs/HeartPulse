import type { SourceDefinition } from './types.js';

export type FetchLike = typeof fetch;
export type Environment = Record<string, string | undefined>;

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

export function assertSafeSourceUrl(rawUrl: string, allowedHosts: string[]): URL {
  const url = new URL(rawUrl);
  const allowed = new Set(allowedHosts.map(host => host.trim().toLowerCase()));
  if (!allowed.has(url.hostname.toLowerCase())) throw new Error(`Source host is outside the allowlist: ${url.hostname}`);
  if (url.protocol === 'https:') return url;
  if (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname)) return url;
  if (url.protocol === 'http:') throw new Error('HTTPS is required; plain HTTP is allowed for loopback sources only');
  throw new Error('Source URL must use HTTPS');
}

export async function readResponseBody(response: Response, maxBytes: number): Promise<string> {
  const length = Number(response.headers.get('content-length') || 0);
  if (length > maxBytes) throw new Error('Response exceeds maximum size');
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let body = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new Error('Response exceeds maximum size');
    }
    body += decoder.decode(value, { stream: true });
  }
  return body + decoder.decode();
}

export async function fetchChecked(fetchImpl: FetchLike, url: URL, source: SourceDefinition, env: Environment, method = 'GET'): Promise<Response> {
  const headers = new Headers({ accept: source.kind === 'head' ? '*/*' : 'application/json' });
  if (source.authHeaderEnv) {
    const key = env[source.authHeaderEnv]?.trim();
    if (key) headers.set('X-API-Key', key);
  }
  return fetchImpl(url, {
    method,
    headers,
    signal: AbortSignal.timeout(source.timeoutMs ?? 15_000),
    redirect: 'error',
    cache: 'no-store',
  });
}
