import { canonicalPagePath } from '../../app/routing/canonicalPagePath';
import { NAVIGATION_ROUTES } from '../../app/routing/navigationDefinitions';

export type SearchArticle = {
  id: string;
  title: string;
  excerpt: string;
  tag: string;
  mode: string;
  date: string;
  url: string;
  image: string;
  vip: boolean;
};

export type SearchCard = {
  id: string;
  name: string;
  nameEn: string;
  text: string;
  image: string;
  mana: number | null;
  className: string;
  cardType: string;
  formats: Array<'standard' | 'wild'>;
  path: string;
};

export type SearchResponse = {
  query: string;
  articles: SearchArticle[];
  cards: SearchCard[];
  minimumQueryLength: number;
};

/** One archetype of the public catalog teaser (`/api/constructed-archetypes/teaser`). */
export type SearchArchetype = {
  slug: string;
  archetypeLabel: string;
  archetype: string;
  classKey: string;
  format: 'standard' | 'wild';
};

/** A row of the header palette. Pages, archetypes and cards are links; an article opens in a new tab. */
export type PaletteEntry =
  | { kind: 'page'; id: string; label: string; meta: string; path: string }
  | { kind: 'archetype'; id: string; label: string; meta: string; path: string; classKey: string }
  | { kind: 'card'; id: string; label: string; meta: string; path: string; image: string }
  | { kind: 'article'; id: string; label: string; meta: string; article: SearchArticle };

export const MINIMUM_REMOTE_QUERY = 2;
const RECENT_KEY = 'hp:search:recent';
const RECENT_LIMIT = 5;

const SECTION_LABELS: Record<(typeof NAVIGATION_ROUTES)[number]['group'], string> = {
  home: '',
  top: '',
  standard: 'Традиционный режим',
  arena: 'Арена',
  'bg-primary': 'Поля Сражений',
  'bg-builder': 'Конструкторы',
  misc: 'Разное',
  footer: 'Справка',
  admin: 'Администрирование',
};

/** Sections in the order of the menu; help and legal pages last. */
const GROUP_ORDER: (typeof NAVIGATION_ROUTES)[number]['group'][] = ['home', 'top', 'standard', 'arena', 'bg-primary', 'bg-builder', 'misc', 'admin', 'footer'];

/** Case- and «ё»-insensitive form of a query or a label. */
export function normalizeSearchText(value: string): string {
  return value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

/** Site sections whose name or mode contains every word of the query; all of them for an empty query. */
/** Labels used by more than one section («Тир-лист» of Arena and Battlegrounds) carry their mode. */
const REPEATED_LABELS = new Set(NAVIGATION_ROUTES.map(route => route.label)
  .filter((label, index, labels) => labels.indexOf(label) !== index));

export function matchPages(query: string, admin: boolean): PaletteEntry[] {
  const terms = normalizeSearchText(query).split(' ').filter(Boolean);
  return [...NAVIGATION_ROUTES]
    .sort((left, right) => GROUP_ORDER.indexOf(left.group) - GROUP_ORDER.indexOf(right.group))
    .filter(route => admin || (route.group !== 'admin' && !('adminOnly' in route && route.adminOnly)))
    .filter(route => {
      // The mode still matches the query («тир поля»), it is only not printed.
      const haystack = normalizeSearchText(`${route.label} ${SECTION_LABELS[route.group]}`);
      return terms.every(term => haystack.includes(term));
    })
    .map(route => ({
      kind: 'page' as const, id: `page:${route.id}`, label: route.label,
      meta: REPEATED_LABELS.has(route.label) ? SECTION_LABELS[route.group] : '',
      path: canonicalPagePath(route.path),
    }));
}

export function archetypeEntry(item: SearchArchetype): PaletteEntry {
  return {
    kind: 'archetype',
    id: `archetype:${item.format}:${item.slug}`,
    label: item.archetypeLabel || item.archetype,
    meta: item.format === 'wild' ? 'Вольный' : 'Стандарт',
    path: `/standard/meta/${item.format}/${item.slug}/`,
    classKey: item.classKey,
  };
}

function cardFormatsLabel(formats: SearchCard['formats']): string {
  if (formats.includes('standard') && formats.includes('wild')) return 'Стандарт · Вольный';
  return formats.includes('standard') ? 'Стандарт' : 'Вольный';
}

export function cardEntry(card: SearchCard): PaletteEntry {
  return {
    kind: 'card',
    id: `card:${card.id}`,
    label: card.name,
    meta: `${card.mana !== null ? `${card.mana} маны · ` : ''}${cardFormatsLabel(card.formats)}`,
    path: canonicalPagePath(card.path),
    image: card.image,
  };
}

function articleModeLabel(mode: string): string {
  if (mode === 'standard') return 'Стандарт';
  if (mode === 'wild') return 'Вольный';
  if (mode === 'arena') return 'Арена';
  if (mode === 'battlegrounds') return 'Поля Сражений';
  return 'Статья';
}

export function articleEntry(article: SearchArticle): PaletteEntry {
  return { kind: 'article', id: `article:${article.id}`, label: article.title, meta: `${article.tag || articleModeLabel(article.mode)} · ${article.date}`, article };
}

function isEntry(value: unknown): value is PaletteEntry {
  const entry = value as PaletteEntry | null;
  if (!entry || typeof entry.id !== 'string' || typeof entry.label !== 'string' || typeof entry.meta !== 'string') return false;
  if (entry.kind === 'article') return typeof entry.article?.url === 'string';
  // Only same-site paths: a stored entry must never become an open redirect.
  return ['page', 'archetype', 'card'].includes(entry.kind) && typeof entry.path === 'string' && /^\/(?!\/)/.test(entry.path);
}

/** The reader's last picks in this browser, newest first; unreadable or foreign entries are dropped. */
export function readRecentEntries(storage: Pick<Storage, 'getItem'> | null): PaletteEntry[] {
  try {
    const stored: unknown = JSON.parse(storage?.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(stored) ? stored.filter(isEntry).slice(0, RECENT_LIMIT) : [];
  } catch {
    return [];
  }
}

export function rememberRecentEntry(storage: Pick<Storage, 'getItem' | 'setItem'> | null, entry: PaletteEntry) {
  const next = [entry, ...readRecentEntries(storage).filter(item => item.id !== entry.id)].slice(0, RECENT_LIMIT);
  try { storage?.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* recents are a convenience */ }
}

export type PaletteGroup = { id: 'recent' | 'pages' | 'archetypes' | 'cards' | 'articles'; title: string; entries: PaletteEntry[] };

/**
 * The palette in display order. An empty query offers the recent picks and
 * every section; a query narrows the sections at once and adds the remote
 * archetypes, cards and articles as they arrive.
 */
export function paletteGroups({ query, admin, recent, archetypes, cards, articles }: {
  query: string; admin: boolean; recent: PaletteEntry[];
  archetypes: SearchArchetype[]; cards: SearchCard[]; articles: SearchArticle[];
}): PaletteGroup[] {
  const groups: PaletteGroup[] = [];
  const empty = normalizeSearchText(query) === '';
  if (empty && recent.length) groups.push({ id: 'recent', title: 'Недавние', entries: recent });
  const pages = matchPages(query, admin);
  if (pages.length) groups.push({ id: 'pages', title: 'Разделы', entries: pages });
  if (!empty) {
    if (archetypes.length) groups.push({ id: 'archetypes', title: 'Архетипы', entries: archetypes.map(archetypeEntry) });
    if (cards.length) groups.push({ id: 'cards', title: 'Карты', entries: cards.map(cardEntry) });
    if (articles.length) groups.push({ id: 'articles', title: 'Статьи', entries: articles.map(articleEntry) });
  }
  return groups;
}
