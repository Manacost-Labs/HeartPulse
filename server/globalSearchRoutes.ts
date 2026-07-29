import { Router } from 'express';
import type { ConstructedCardCollection, ConstructedCardFormat } from './constructedCardRoutes.js';
import { articleImageSrc } from '../shared/articleImageSrc.js';
import { publicResourceUrl } from '../shared/publicResourceUrl.js';

type JsonRecord = Record<string, any>;
type ArticlesCacheEntry = { data: any; etag: string };

export type GlobalSearchDependencies = {
  loadArticles: () => ArticlesCacheEntry | null;
  loadCards: (format: ConstructedCardFormat) => Promise<ConstructedCardCollection>;
  getArticleMode: (article: JsonRecord) => string;
  isVipArticleUrl: (url: string) => boolean;
  cacheHeader?: string;
  onError?: (error: unknown) => void;
};

type SearchInput = {
  query: string;
  articles: JsonRecord[];
  cardsByFormat: Record<ConstructedCardFormat, JsonRecord[]>;
  getArticleMode: (article: JsonRecord) => string;
  isVipArticleUrl: (url: string) => boolean;
  articleLimit?: number;
  cardLimit?: number;
};

const MINIMUM_QUERY_LENGTH = 2;
const MAXIMUM_QUERY_LENGTH = 80;
const DEFAULT_ARTICLE_LIMIT = 6;
const DEFAULT_CARD_LIMIT = 8;

function plainText(value: unknown): string {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function normalized(value: unknown): string {
  return plainText(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ё/g, 'е')
    .toLocaleLowerCase('ru');
}

function boundedQuery(value: unknown): string {
  return plainText(value).slice(0, MAXIMUM_QUERY_LENGTH);
}

function boundedLimit(value: number | undefined, fallback: number, maximum: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.min(maximum, Math.floor(value as number))) : fallback;
}

function matchScore(query: string, primary: unknown, fields: unknown[]): number {
  const title = normalized(primary);
  if (title === query) return 1_000;
  if (title.startsWith(query)) return 800;
  if (title.includes(query)) return 600;
  for (let index = 0; index < fields.length; index += 1) {
    const field = normalized(fields[index]);
    if (!field) continue;
    if (field.startsWith(query)) return 420 - index;
    if (field.includes(query)) return 300 - index;
  }
  return 0;
}

function articleDateMs(article: JsonRecord): number {
  const parsed = Date.parse(String(article?.date ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function cardName(card: JsonRecord): string {
  return plainText(card?.name?.ru || card?.name?.en || card?.name || card?.card_id);
}

function cardSearchFields(card: JsonRecord): unknown[] {
  return [
    card?.name?.en,
    card?.text?.ru,
    card?.text?.en,
    card?.flavor?.ru,
    card?.flavor?.en,
    card?.card_id,
    card?.slug,
    card?.card_set,
    card?.class,
    card?.card_type?.name_ru,
    card?.card_type?.slug,
    ...(Array.isArray(card?.mechanics) ? card.mechanics : []),
    ...(Array.isArray(card?.referenced_tags) ? card.referenced_tags : []),
  ];
}

export function searchGlobalContent(input: SearchInput) {
  const query = normalized(input.query);
  const articleLimit = boundedLimit(input.articleLimit, DEFAULT_ARTICLE_LIMIT, 12);
  const cardLimit = boundedLimit(input.cardLimit, DEFAULT_CARD_LIMIT, 16);

  if (query.length < MINIMUM_QUERY_LENGTH) return { articles: [], cards: [] };

  const articles = input.articles
    .map(article => ({
      article,
      score: matchScore(query, article?.title, [article?.tag, article?.excerpt, article?.date, article?.mode]),
    }))
    .filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score || articleDateMs(right.article) - articleDateMs(left.article))
    .slice(0, articleLimit)
    .map(({ article }) => {
      const url = String(article?.url ?? '').trim();
      return {
        id: String(article?.id ?? ''),
        title: plainText(article?.title),
        excerpt: plainText(article?.excerpt).slice(0, 180),
        tag: plainText(article?.tag),
        mode: input.getArticleMode(article),
        date: String(article?.date ?? ''),
        url,
        image: articleImageSrc(String(article?.image ?? '')),
        vip: Boolean(url && input.isVipArticleUrl(url)),
      };
    });

  const candidates = new Map<string, { card: JsonRecord; score: number; formats: Set<ConstructedCardFormat> }>();
  for (const format of ['standard', 'wild'] as const) {
    for (const card of input.cardsByFormat[format] ?? []) {
      const id = String(card?.card_id ?? '').trim();
      if (!id) continue;
      const score = matchScore(query, cardName(card), cardSearchFields(card));
      if (score <= 0) continue;
      const key = id.toUpperCase();
      const existing = candidates.get(key);
      if (existing) {
        existing.formats.add(format);
        if (score > existing.score || (score === existing.score && format === 'standard')) {
          existing.card = card;
          existing.score = score;
        }
      } else {
        candidates.set(key, { card, score, formats: new Set([format]) });
      }
    }
  }

  const cards = [...candidates.values()]
    .sort((left, right) => right.score - left.score || cardName(left.card).localeCompare(cardName(right.card), 'ru'))
    .slice(0, cardLimit)
    .map(({ card, formats }) => {
      const orderedFormats = [...formats].sort(format => format === 'standard' ? -1 : 1);
      const preferredFormat = orderedFormats[0] ?? 'wild';
      const id = String(card.card_id);
      return {
        id,
        name: cardName(card),
        nameEn: plainText(card?.name?.en),
        text: plainText(card?.text?.ru || card?.text?.en).slice(0, 180),
        image: publicResourceUrl(String(card?.images?.card || card?.images?.crop || '')),
        mana: Number.isFinite(Number(card?.mana_cost)) ? Number(card.mana_cost) : null,
        className: String(card?.class ?? ''),
        cardType: plainText(card?.card_type?.name_ru || card?.card_type?.slug),
        formats: orderedFormats,
        path: `/standard/cards/${preferredFormat}/${encodeURIComponent(id)}`,
      };
    });

  return { articles, cards };
}

export function createGlobalSearchRouter(dependencies: GlobalSearchDependencies): Router {
  const router = Router();
  const cacheHeader = dependencies.cacheHeader ?? 'public, max-age=60, stale-while-revalidate=120';

  router.get('/search', async (request, response) => {
    const query = boundedQuery(request.query.q);
    if (normalized(query).length < MINIMUM_QUERY_LENGTH) {
      response.set('Cache-Control', cacheHeader);
      return response.json({ query, articles: [], cards: [], minimumQueryLength: MINIMUM_QUERY_LENGTH });
    }

    try {
      const articleEntry = dependencies.loadArticles();
      const [standard, wild] = await Promise.allSettled([
        dependencies.loadCards('standard'),
        dependencies.loadCards('wild'),
      ]);
      const cardsByFormat = {
        standard: standard.status === 'fulfilled' ? standard.value.cards : [],
        wild: wild.status === 'fulfilled' ? wild.value.cards : [],
      };
      if (!articleEntry && standard.status === 'rejected' && wild.status === 'rejected') {
        throw standard.reason || wild.reason || new Error('Search datasets are unavailable');
      }
      const result = searchGlobalContent({
        query,
        articles: Array.isArray(articleEntry?.data?.articles) ? articleEntry.data.articles : [],
        cardsByFormat,
        getArticleMode: dependencies.getArticleMode,
        isVipArticleUrl: dependencies.isVipArticleUrl,
      });
      response.set('Cache-Control', cacheHeader);
      return response.json({ query, ...result, minimumQueryLength: MINIMUM_QUERY_LENGTH });
    } catch (error) {
      dependencies.onError?.(error);
      return response.status(502).json({ error: 'Глобальный поиск временно недоступен' });
    }
  });

  return router;
}
