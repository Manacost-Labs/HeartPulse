import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ReactElement } from 'react';
import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { fetchPublicExpress } from './expressApi';

/** The size Telegram, Discord, VK and X all show as a large preview (1.91:1). */
export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_COLORS = { ink: '#1b120c', panel: '#2a1c12', gold: '#f3d9a4', muted: '#cdb48a', win: '#8fd16a', loss: '#e7826b' } as const;

/** Finished images, newest last: a shared link is fetched by every chat preview bot at once. */
const IMAGE_CACHE_SIZE = 64;
const images = new Map<string, Promise<Uint8Array | null>>();

let font: Promise<Buffer> | null = null;
let logo: Promise<string | null> | null = null;

/**
 * The site's display font (the OTF of `HSDisplay`, assets.md) has the Cyrillic the previews need; satori cannot read
 * WOFF2. Production runs `next start apps/public-web` from the release root; the second path is for a start from the app.
 */
function loadFont(): Promise<Buffer> {
  font ??= readFile(join(process.cwd(), 'public/fonts/2318-font.otf'))
    .catch(() => readFile(join(process.cwd(), '../../public/fonts/2318-font.otf')));
  font.catch(() => { font = null; });
  return font;
}

async function pngDataUri(input: Buffer | Uint8Array, width: number): Promise<string> {
  const png = await sharp(input).resize({ width, withoutEnlargement: true }).png().toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

/** The Hearthpulse logo of `public/` as a PNG data URI (satori draws neither WebP nor files). */
export function loadLogo(): Promise<string | null> {
  logo ??= readFile(join(process.cwd(), 'public/hearthpulse-logo.webp'))
    .catch(() => readFile(join(process.cwd(), '../../public/hearthpulse-logo.webp')))
    .then(data => pngDataUri(data, 96))
    .catch(() => null);
  return logo;
}

/**
 * A card's art from the site's own card-image route (HearthstoneJSON art the site already serves, ADR 0009), as a PNG
 * data URI; null when it cannot be read, so the image is drawn without it.
 */
export async function cardArt(cardId: string, variant: 'full' | 'tile', width: number): Promise<string | null> {
  if (!/^[A-Za-z0-9_]{1,80}$/.test(cardId)) return null;
  try {
    const response = await fetchPublicExpress(`/api/card-image/${encodeURIComponent(cardId)}/${variant}.webp`, AbortSignal.timeout(4_000));
    if (!response.ok || !(response.headers.get('content-type') ?? '').startsWith('image/')) return null;
    return await pngDataUri(Buffer.from(await response.arrayBuffer()), width);
  } catch {
    return null;
  }
}

async function render(element: ReactElement): Promise<Uint8Array> {
  const response = new ImageResponse(element, {
    ...OG_SIZE,
    fonts: [{ name: 'HSDisplay', data: await loadFont(), weight: 400, style: 'normal' }],
  });
  // JPEG: a card-art preview is 0.3–0.6 MB as PNG; some chats (WhatsApp, VK) drop previews above ~300 KB.
  return new Uint8Array(await sharp(Buffer.from(await response.arrayBuffer())).jpeg({ quality: 84, mozjpeg: true }).toBuffer());
}

/**
 * The image for `key`, drawn once per process while it stays among the newest; `draw` returns null for an absent
 * subject (the route answers 404). A failed draw is not kept.
 */
export function cachedOgImage(key: string, draw: () => Promise<ReactElement | null>): Promise<Uint8Array | null> {
  const known = images.get(key);
  if (known) {
    images.delete(key);
    images.set(key, known);
    return known;
  }
  const made = draw().then(element => (element ? render(element) : null));
  images.set(key, made);
  made.catch(() => images.delete(key));
  if (images.size > IMAGE_CACHE_SIZE) images.delete(images.keys().next().value as string);
  return made;
}

/**
 * The route's answer: the JPEG cached for five minutes (a deleted replay stops being served soon; chat apps keep their
 * own copies), or a bare 404 that no preview keeps.
 */
export function ogImageResponse(png: Uint8Array | null): Response {
  if (!png) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' } });
  return new Response(png as BodyInit, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=300',
      'X-Robots-Tag': 'noindex',
    },
  });
}

/** The bottom band of every preview: logo, name and the site. */
export function OgBrand({ logoUri, caption }: { logoUri: string | null; caption: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '0 56px',
      height: 96, background: '#120b07', borderTop: `2px solid ${OG_COLORS.muted}` }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {logoUri ? <img src={logoUri} width={52} height={56} alt="" style={{ marginRight: 18 }} /> : null}
        <span style={{ fontSize: 40, color: OG_COLORS.gold }}>Hearthpulse</span>
      </div>
      <span style={{ fontSize: 28, color: OG_COLORS.muted }}>{caption}</span>
    </div>
  );
}
