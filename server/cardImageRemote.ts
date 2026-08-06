export type CardImageRemoteCandidateKind =
  | 'hsjson_render_ru'
  | 'hsjson_render_en'
  | 'wiki_card'
  | 'hsjson_full_art';

export type CardImageRemoteCandidate = {
  kind: CardImageRemoteCandidateKind;
  url: string;
};

const CARD_IMAGE_USER_AGENT = 'Mozilla/5.0 (compatible; ManacostArena/1.0)';

/**
 * Returns trusted public image sources in quality order. The wiki and full-art
 * fallbacks cover the short release window when HearthstoneJSON already has a
 * card record but has not generated its localized framed render yet.
 */
export function cardImageRemoteCandidates(cardId: string): CardImageRemoteCandidate[] {
  if (!/^[A-Za-z0-9_]{1,80}$/.test(cardId)) throw new Error('Invalid card image ID');
  const encoded = encodeURIComponent(cardId);
  return [
    {
      kind: 'hsjson_render_ru',
      url: `https://art.hearthstonejson.com/v1/render/latest/ruRU/512x/${encoded}.png`,
    },
    {
      kind: 'hsjson_render_en',
      url: `https://art.hearthstonejson.com/v1/render/latest/enUS/512x/${encoded}.png`,
    },
    {
      kind: 'wiki_card',
      url: `https://hearthstone.wiki.gg/wiki/Special:Redirect/file/${encoded}.png`,
    },
    {
      kind: 'hsjson_full_art',
      url: `https://art.hearthstonejson.com/v1/orig/${encoded}.png`,
    },
  ];
}

/** Downloads the first valid image without ever accepting an HTML error page. */
export async function downloadFallbackCardImage(
  cardId: string,
  fetchImage: typeof fetch = fetch,
): Promise<Buffer> {
  let lastError: Error | null = null;
  for (const candidate of cardImageRemoteCandidates(cardId)) {
    try {
      const response = await fetchImage(candidate.url, {
        headers: { 'User-Agent': CARD_IMAGE_USER_AGENT },
        signal: AbortSignal.timeout(15_000),
        redirect: 'follow',
      });
      if (!response.ok) {
        lastError = new Error(`${candidate.kind} HTTP ${response.status}`);
        continue;
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.toLowerCase().startsWith('image/')) {
        lastError = new Error(`${candidate.kind} returned ${contentType || 'unknown content type'}`);
        continue;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.length) {
        lastError = new Error(`${candidate.kind} returned an empty image`);
        continue;
      }
      return buffer;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  throw lastError ?? new Error('Card image unavailable');
}
