import dns from 'node:dns';
import { lookup } from 'node:dns/promises';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { Readable } from 'node:stream';
import { isForbiddenRemoteAddress, normalizedIp } from './remoteAddressPolicy.js';

export class RemoteAdminImageError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

type RemoteImageOptions = {
  maxBytes: number;
  fetchImpl?: typeof fetch;
  resolveHost?: (hostname: string) => Promise<string[]>;
  timeoutMs?: number;
  maxRedirects?: number;
};

function parseRemoteImageUrl(value: unknown): URL {
  let url: URL;
  try {
    url = new URL(String(value ?? '').trim());
  } catch {
    throw new RemoteAdminImageError(400, 'Укажите корректную ссылку на изображение');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new RemoteAdminImageError(400, 'Разрешены только публичные HTTP(S)-ссылки без логина и пароля');
  }
  return url;
}

async function defaultResolveHost(hostname: string): Promise<string[]> {
  if (isIP(normalizedIp(hostname))) return [normalizedIp(hostname)];
  return (await lookup(hostname, { all: true, verbatim: true })).map(result => result.address);
}

const timedOut = () => new RemoteAdminImageError(504, 'Источник изображения не ответил вовремя');

function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(timedOut());
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

async function assertPublicUrl(url: URL, resolveHost: (hostname: string) => Promise<string[]>, signal: AbortSignal): Promise<void> {
  const hostname = normalizedIp(url.hostname);
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new RemoteAdminImageError(400, 'Локальные адреса запрещены');
  }
  if (isIP(hostname) && isForbiddenRemoteAddress(hostname)) {
    throw new RemoteAdminImageError(400, 'Ссылка ведёт на закрытый или локальный адрес');
  }
  let addresses: string[];
  try {
    addresses = await untilAborted(resolveHost(hostname), signal);
  } catch (error) {
    if (error instanceof RemoteAdminImageError) throw error;
    throw new RemoteAdminImageError(400, 'Не удалось найти домен изображения');
  }
  if (!addresses.length || addresses.some(isForbiddenRemoteAddress)) {
    throw new RemoteAdminImageError(400, 'Ссылка ведёт на закрытый или локальный адрес');
  }
}

/**
 * The lookup the socket connects with. The pre-check above resolves the name once, but a rebinding
 * DNS server can answer differently a moment later; only an answer checked here reaches connect().
 * `dns.lookup` is read at call time so the resolver stays replaceable in tests.
 */
const checkedLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { all: true, verbatim: true, family: options.family }, (error, addresses) => {
    if (error) return callback(error, '', 0);
    if (!addresses.length || addresses.some(entry => isForbiddenRemoteAddress(entry.address))) {
      return callback(new RemoteAdminImageError(400, 'Ссылка ведёт на закрытый или локальный адрес'), '', 0);
    }
    if (options.all) return (callback as unknown as (error: null, list: dns.LookupAddress[]) => void)(null, addresses);
    return callback(null, addresses[0].address, addresses[0].family);
  });
};

function responseFrom(message: IncomingMessage): Response {
  const headers = new Headers();
  for (const [name, value] of Object.entries(message.headers)) {
    for (const item of value === undefined ? [] : [value].flat()) headers.append(name, item);
  }
  const status = message.statusCode ?? 0;
  if (status < 200 || status > 599) throw new RemoteAdminImageError(502, 'Источник изображения вернул некорректный ответ');
  const body = status === 204 || status === 304 ? null : Readable.toWeb(message) as unknown as ReadableStream<Uint8Array>;
  return new Response(body, { status, headers });
}

/** GET over node:http(s) with `checkedLookup`; never follows redirects (the caller re-checks each hop). */
const checkedFetch = ((input: URL, init: RequestInit = {}) => new Promise<Response>((resolve, reject) => {
  const send = input.protocol === 'https:' ? httpsRequest : httpRequest;
  const request = send(input, {
    method: 'GET',
    headers: init.headers as Record<string, string>,
    signal: init.signal ?? undefined,
    lookup: checkedLookup,
    agent: false,
  }, message => {
    try {
      resolve(responseFrom(message));
    } catch (error) {
      message.destroy();
      reject(error);
    }
  });
  request.on('error', reject);
  request.end();
})) as unknown as typeof fetch;

async function readLimitedImage(response: Response, maxBytes: number, signal: AbortSignal): Promise<Buffer> {
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RemoteAdminImageError(413, 'Картинка слишком большая');
  }
  if (!response.body) throw new RemoteAdminImageError(400, 'Ссылка вернула пустой ответ');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel('remote admin image exceeds limit');
        throw new RemoteAdminImageError(413, 'Картинка слишком большая');
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof RemoteAdminImageError) throw error;
    if (signal.aborted) throw timedOut();
    throw new RemoteAdminImageError(502, 'Не удалось дочитать изображение по ссылке');
  } finally {
    reader.releaseLock();
  }
  if (!total) throw new RemoteAdminImageError(400, 'Ссылка вернула пустое изображение');
  return Buffer.concat(chunks, total);
}

export async function fetchRemoteAdminImage(value: unknown, options: RemoteImageOptions): Promise<Buffer> {
  const fetchImpl = options.fetchImpl ?? checkedFetch;
  const resolveHost = options.resolveHost ?? defaultResolveHost;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxRedirects = options.maxRedirects ?? 3;
  let url = parseRemoteImageUrl(value);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const signal = AbortSignal.timeout(timeoutMs);
    await assertPublicUrl(url, resolveHost, signal);
    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: {
          Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8',
          'User-Agent': 'Manacost admin image importer/1.0',
        },
        redirect: 'manual',
        signal,
      });
    } catch (error) {
      if (error instanceof RemoteAdminImageError) throw error;
      if (signal.aborted) throw timedOut();
      throw new RemoteAdminImageError(502, 'Не удалось скачать изображение по ссылке');
    }

    // A hop that is not read must release its socket now, not when the hop's timeout fires.
    const discard = () => { void response.body?.cancel().catch(() => {}); };
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      discard();
      if (redirectCount === maxRedirects) throw new RemoteAdminImageError(400, 'Слишком много перенаправлений');
      const location = response.headers.get('location');
      if (!location) throw new RemoteAdminImageError(400, 'Источник вернул некорректное перенаправление');
      url = parseRemoteImageUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok) {
      discard();
      throw new RemoteAdminImageError(400, `Источник изображения вернул HTTP ${response.status}`);
    }
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('image/')) {
      discard();
      throw new RemoteAdminImageError(415, 'Ссылка ведёт не на изображение');
    }
    return readLimitedImage(response, options.maxBytes, signal);
  }
  throw new RemoteAdminImageError(400, 'Слишком много перенаправлений');
}
