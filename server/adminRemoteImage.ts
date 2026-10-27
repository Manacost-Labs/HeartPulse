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
    const [a, b, c] = address.split('.').map(Number);
    return a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0 && (c === 0 || c === 2)) // IETF protocol assignments, TEST-NET-1
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
      || a >= 224;
  }
  if (family === 6) {
    const h = ipv6Hextets(address);
    if (!h) return true;
    // An IPv6 address can carry an IPv4 one that the socket layer still reaches. WHATWG URL
    // and resolvers write it in hex hextets ([::ffff:127.0.0.1] becomes [::ffff:7f00:1]),
    // so compare the numbers, not the spelling.
    const embedded = (high: number, low: number) => isForbiddenRemoteAddress(
      `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`,
    );
    const zero = (from: number, to: number) => h.slice(from, to).every(group => group === 0);
    if (zero(0, 5) && (h[5] === 0 || h[5] === 0xffff)) return embedded(h[6], h[7]); // ::, ::1, compatible, mapped
    if (zero(0, 4) && h[4] === 0xffff && h[5] === 0) return embedded(h[6], h[7]); // ::ffff:0:0/96 translated
    if (h[0] === 0x64 && h[1] === 0xff9b) return zero(2, 6) ? embedded(h[6], h[7]) : true; // NAT64, local-use NAT64
    if (h[0] === 0x2002) return embedded(h[1], h[2]); // 6to4
    if (h[0] === 0x2001 && (h[1] === 0 || h[1] === 0xdb8)) return true; // Teredo, documentation
    if (h[0] === 0x100 && zero(1, 4)) return true; // discard prefix
    return (h[0] & 0xfe00) === 0xfc00 // unique local
      || (h[0] & 0xffc0) === 0xfe80 // link-local
      || (h[0] & 0xffc0) === 0xfec0 // site-local
      || (h[0] & 0xff00) === 0xff00; // multicast
  }
  return false;
}

/** The eight groups of an address `isIP` accepted as IPv6, or null when it cannot be read. */
function ipv6Hextets(address: string): number[] | null {
  let text = address.split('%', 1)[0];
  const dotted = text.match(/^(.*:)(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (dotted) {
    const [, prefix, a, b, c, d] = dotted;
    text = `${prefix}${((Number(a) << 8) | Number(b)).toString(16)}:${((Number(c) << 8) | Number(d)).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const groups = (part: string) => (part ? part.split(':').map(group => Number.parseInt(group, 16)) : []);
  const head = groups(halves[0]);
  const tail = halves.length === 2 ? groups(halves[1]) : [];
  const fill = 8 - head.length - tail.length;
  if (halves.length === 2 ? fill < 1 : fill !== 0) return null;
  const all = [...head, ...Array<number>(halves.length === 2 ? fill : 0).fill(0), ...tail];
  return all.every(group => Number.isInteger(group) && group >= 0 && group <= 0xffff) ? all : null;
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
