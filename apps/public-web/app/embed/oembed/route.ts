import 'server-only';
import { deckTitle } from '@/apps/public-web/lib/embedBodies';
import { oembedIframe, oembedSize, oembedTarget } from '@/apps/public-web/lib/oembed';
import { loadPublicDeck } from '@/apps/public-web/lib/publicDeck';
import { loadPublicReplay } from '@/apps/public-web/lib/publicReplay';
import { replayShareText, replayUrls, SITE_ORIGIN } from '@/apps/public-web/lib/replayShare';

export const dynamic = 'force-dynamic';

const json = (body: unknown, status: number, cache: string) => Response.json(body, {
  status,
  headers: { 'Cache-Control': cache, 'Access-Control-Allow-Origin': '*', 'X-Robots-Tag': 'noindex' },
});
const fail = (status: number, message: string) => json({ error: message }, status, 'no-store');
const number = (value: string | null) => (value && /^\d{1,5}$/.test(value) ? Number(value) : null);

/**
 * oEmbed 1.0 (JSON only) for replay pages and deck embeds: WordPress, Discourse and other consumers turn a pasted
 * hearthpulse.net link into the iframe. Contract: docs/specs/embeds-and-oembed.md.
 */
export async function GET(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams;
  const format = query.get('format');
  if (format && format !== 'json') return fail(501, 'Only format=json is supported');
  const target = oembedTarget(query.get('url'));
  if (!target) return fail(404, 'Not an embeddable Hearthpulse URL');
  const { width, height } = oembedSize(target.kind, number(query.get('maxwidth')), number(query.get('maxheight')));
  const base = { version: '1.0', type: 'rich', provider_name: 'Hearthpulse', provider_url: `${SITE_ORIGIN}/`, width, height };

  if (target.kind === 'replay') {
    const replay = await loadPublicReplay(target.id);
    if (replay === 'unavailable') return fail(503, 'Try again in a minute');
    if (!replay) return fail(404, 'No such replay');
    const { title } = replayShareText(replay);
    const urls = replayUrls(replay.id);
    return json({
      ...base, title, html: oembedIframe(urls.embed, title, width, height),
      thumbnail_url: urls.image, thumbnail_width: 1200, thumbnail_height: 630,
    }, 200, 'no-cache');
  }
  const deck = await loadPublicDeck(target.code);
  if (deck === 'unavailable') return fail(503, 'Try again in a minute');
  if (!deck) return fail(404, 'Not a deck code');
  const title = deckTitle(deck);
  const src = `${SITE_ORIGIN}/embed/deck/${encodeURIComponent(deck.deckCode)}/`;
  return json({ ...base, title, html: oembedIframe(src, title, width, height) }, 200, 'public, max-age=3600');
}
