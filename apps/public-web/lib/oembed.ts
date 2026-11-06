import { EMBED_SIZES } from './embedDocument';

export type OembedTarget = { kind: 'replay'; id: string } | { kind: 'deck'; code: string };

const HOSTS = new Set(['hearthpulse.net', 'www.hearthpulse.net']);

/**
 * Which embed a shared URL names: a replay page or its embed, or a deck embed. Anything else (another host, another
 * page) is not embeddable and the endpoint answers 404, as oEmbed requires.
 */
export function oembedTarget(raw: string | null): OembedTarget | null {
  if (!raw || raw.length > 1200) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !HOSTS.has(url.hostname)) return null;
  const replay = /^\/(?:embed\/)?replay\/([0-9A-Za-z]{10})\/?$/.exec(url.pathname);
  if (replay) return { kind: 'replay', id: replay[1] };
  const deck = /^\/embed\/deck\/(.+?)\/?$/.exec(url.pathname);
  if (deck) {
    let code: string;
    try {
      code = decodeURIComponent(deck[1]);
    } catch {
      return null;
    }
    return /^[A-Za-z0-9+/]{8,400}={0,2}$/.test(code) ? { kind: 'deck', code } : null;
  }
  return null;
}

/** The iframe size within the consumer's `maxwidth`/`maxheight`, never below a readable minimum. */
export function oembedSize(kind: OembedTarget['kind'], maxWidth: number | null, maxHeight: number | null) {
  const base = EMBED_SIZES[kind];
  const width = maxWidth && maxWidth > 0 ? Math.max(280, Math.min(base.width, Math.trunc(maxWidth))) : base.width;
  const height = maxHeight && maxHeight > 0 ? Math.max(240, Math.min(base.height, Math.trunc(maxHeight))) : base.height;
  return { width, height };
}

export function oembedIframe(src: string, title: string, width: number, height: number): string {
  const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return `<iframe src="${escape(src)}" title="${escape(title)}" width="${width}" height="${height}" loading="lazy" `
    + 'style="border:0;border-radius:10px;max-width:100%" referrerpolicy="strict-origin-when-cross-origin"></iframe>';
}
