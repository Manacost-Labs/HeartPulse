import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

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

function normalizedIp(value: string): string {
  return value.trim().toLowerCase().replace(/^\[|\]$/g, '');
}

export function isForbiddenRemoteAddress(value: string): boolean {
  const address = normalizedIp(value);
  const family = isIP(address);
  if (family === 4) {
    const [a, b] = address.split('.').map(Number);
    return a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
      || a >= 224;
  }
  if (family === 6) {
    if (address === '::' || address === '::1') return true;
    if (/^(fc|fd|fe[89ab]|ff)/.test(address)) return true;
    const mapped = address.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isForbiddenRemoteAddress(mapped[1]) : false;
  }
  return false;
}

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

async function assertPublicUrl(url: URL, resolveHost: (hostname: string) => Promise<string[]>): Promise<void> {
  const hostname = normalizedIp(url.hostname);
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new RemoteAdminImageError(400, 'Локальные адреса запрещены');
  }
  if (isIP(hostname) && isForbiddenRemoteAddress(hostname)) {
    throw new RemoteAdminImageError(400, 'Ссылка ведёт на закрытый или локальный адрес');
  }
  let addresses: string[];
  try {
    addresses = await resolveHost(hostname);
  } catch {
    throw new RemoteAdminImageError(400, 'Не удалось найти домен изображения');
  }
  if (!addresses.length || addresses.some(isForbiddenRemoteAddress)) {
    throw new RemoteAdminImageError(400, 'Ссылка ведёт на закрытый или локальный адрес');
  }
}

async function readLimitedImage(response: Response, maxBytes: number): Promise<Buffer> {
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
  } finally {
    reader.releaseLock();
  }
  if (!total) throw new RemoteAdminImageError(400, 'Ссылка вернула пустое изображение');
  return Buffer.concat(chunks, total);
}

export async function fetchRemoteAdminImage(value: unknown, options: RemoteImageOptions): Promise<Buffer> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const resolveHost = options.resolveHost ?? defaultResolveHost;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxRedirects = options.maxRedirects ?? 3;
  let url = parseRemoteImageUrl(value);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    await assertPublicUrl(url, resolveHost);
    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: {
          Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8',
          'User-Agent': 'Manacost admin image importer/1.0',
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (error instanceof RemoteAdminImageError) throw error;
      throw new RemoteAdminImageError(502, 'Не удалось скачать изображение по ссылке');
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirectCount === maxRedirects) throw new RemoteAdminImageError(400, 'Слишком много перенаправлений');
      const location = response.headers.get('location');
      if (!location) throw new RemoteAdminImageError(400, 'Источник вернул некорректное перенаправление');
      url = parseRemoteImageUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok) throw new RemoteAdminImageError(400, `Источник изображения вернул HTTP ${response.status}`);
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('image/')) {
      throw new RemoteAdminImageError(415, 'Ссылка ведёт не на изображение');
    }
    return readLimitedImage(response, options.maxBytes);
  }
  throw new RemoteAdminImageError(400, 'Слишком много перенаправлений');
}
