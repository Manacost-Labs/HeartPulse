/**
 * Радар нерфов и баффов (docs/specs/nerf-buff-radar.md). hs-data-api отдаёт
 * `RadarResult` (app/balance_radar/schema.py) в конверте `{ data, meta }`;
 * здесь он проверяется и приводится к модели страницы. Это прогноз, а не
 * официальные данные Blizzard, поэтому страница всегда показывает
 * дисклеймер, а ответ — модель и источники.
 *
 * Разбор строгий к каркасу и мягкий к записям: ответ без `generatedAt`,
 * `summary` или списков отклоняется целиком, а кандидат или пост с битыми
 * полями выпадает, чтобы одна запись модели не гасила весь радар. Ссылки
 * постов пропускаются только `https:` и только на домены своей сети, даты
 * приводятся к ISO, текст ограничен по длине.
 */

export const RADAR_CLASS_KEYS = [
  'deathknight', 'demonhunter', 'druid', 'hunter', 'mage', 'paladin',
  'priest', 'rogue', 'shaman', 'warlock', 'warrior', 'neutral',
] as const;

export type RadarClassKey = typeof RADAR_CLASS_KEYS[number];
export type RadarKind = 'card' | 'archetype' | 'class';
export type RadarPostSource = 'reddit' | 'x';
export type RadarSentiment = 'negative' | 'mixed' | 'neutral' | 'positive' | 'no_data';
export type RadarStance = 'wants_nerf' | 'wants_buff' | 'divided' | 'indifferent' | 'no_data';

export type RadarTrendPoint = {
  period: string;
  /** Подпись периода по-русски («Неделя», «Баны»). */
  label: string;
  /** Проценты 0–100; `null` — нет данных, а не ноль. */
  winrate: number | null;
  popularity: number | null;
  games: number | null;
};

export type RadarStats = {
  source: 'hsguru' | 'hsreplay';
  /** Ранг и период основных чисел, по-русски. */
  rankLabel: string;
  periodLabel: string;
  winrate: number | null;
  popularity: number | null;
  /** Игры архетипа или класса; для карты — сколько раз её сыграли. */
  games: number | null;
  /** Периоды основного ранга в порядке источника. */
  trend: RadarTrendPoint[];
};

export type RadarPost = {
  source: RadarPostSource;
  kind: 'post' | 'comment' | 'tweet';
  url: string;
  author: string;
  score: number;
  comments: number | null;
  title: string | null;
  text: string;
  community: string | null;
  publishedAt: string | null;
  /** Пост официального аккаунта Blizzard или разработчика. */
  official: boolean;
};

export type RadarSocial = {
  mentions: number;
  reddit: number;
  x: number;
  sentiment: RadarSentiment;
  stance: RadarStance;
  summary: string | null;
  posts: RadarPost[];
};

export type RadarPrecedentStats = { winrate: number | null; popularity: number | null };

/** Прошлая правка Blizzard, похожая на кандидата (история патчей hs-data-api). */
export type RadarPrecedent = {
  id: string;
  /** Короткая версия патча («36.4.2»). */
  patch: string;
  date: string | null;
  name: string;
  classKey: RadarClassKey;
  direction: 'nerf' | 'buff' | 'rework' | 'neutral';
  /** Изменения строками: «Атака: 8 → 9». */
  changes: string[];
  summary: string | null;
  /** Числа карты до и после правки; `null` — их нет. */
  before: RadarPrecedentStats | null;
  after: RadarPrecedentStats | null;
  /** Чем случай похож на кандидата, по-русски. */
  similarity: string[];
  /** Модель опиралась на этот случай в выводе. */
  cited: boolean;
  cardHref: string | null;
  patchHref: string;
};

/** Закономерность решений Blizzard по истории патчей. */
export type RadarPattern = { title: string; text: string | null; count: number | null };

export type RadarCandidate = {
  id: string;
  kind: RadarKind;
  entity: {
    /** `cardId`, slug архетипа Стандарта или ключ класса. */
    id: string;
    dbfId: number | null;
    name: string;
    nameEn: string | null;
    classKey: RadarClassKey;
    /** Страница сущности на сайте; у класса её нет. */
    href: string | null;
  };
  /** Уверенность модели 0–100 и её значение в прошлом запуске. */
  confidence: number;
  previousConfidence: number | null;
  headline: string | null;
  verdict: string;
  reasons: string[];
  suggestedChange: string | null;
  stats: RadarStats;
  social: RadarSocial;
  /** Похожие прошлые случаи: сначала те, на которые опиралась модель. */
  precedents: RadarPrecedent[];
  firstSeenAt: string | null;
};

export type RadarSource = { id: string; label: string; items: number | null };

export type RadarReport = {
  schemaVersion: 1;
  generatedAt: string;
  model: string;
  format: 'standard';
  /** Патч, на котором считали радар, и его страница в архиве патчноутов сайта. */
  patch: { version: string; href: string } | null;
  /** Окно сбора обсуждений. */
  window: { from: string; to: string } | null;
  sources: RadarSource[];
  summary: string;
  nerfs: RadarCandidate[];
  buffs: RadarCandidate[];
  /** Закономерности Blizzard; пусто, пока hs-data-api их не считает. */
  patterns: RadarPattern[];
  /**
   * Ставит только сервер сайта: `true`, когда вместо hs-data-api отдана
   * встроенная демонстрационная фикстура (флаг `RADAR_FIXTURE=1`).
   */
  demo: boolean;
};

/** Как назвать архетип HSGuru на сайте: slug страницы и русское имя. */
export type RadarArchetypeNamer = (name: string) => { slug: string; label: string };

const MAX_CANDIDATES = 30;
const MAX_POSTS = 6;
const MAX_REASONS = 8;
const MAX_TREND = 12;
const MAX_PRECEDENTS = 4;
const MAX_PATTERNS = 8;
const DIRECTIONS = new Set<RadarPrecedent['direction']>(['nerf', 'buff', 'rework', 'neutral']);

const CLASS_ALIASES: Record<string, RadarClassKey> = { dk: 'deathknight', dh: 'demonhunter' };
const POST_HOSTS: Record<RadarPostSource, RegExp> = {
  reddit: /^(?:[a-z0-9-]+\.)*reddit\.com$|^redd\.it$/,
  x: /^(?:[a-z0-9-]+\.)*(?:x|twitter)\.com$/,
};
const RANK_LABELS: Record<string, string> = { all: 'Все ранги', legend: 'Легенда', diamond_4_1: 'Алмаз 4–1', top_legend: 'Топ легенды' };
const PERIOD_LABELS: Record<string, string> = {
  '1d': 'Сутки', '3d': '3 дня', '7d': 'Неделя', '14d': '2 недели', patch: 'С патча',
  past_3_hours: '3 часа', past_6_hours: '6 часов', past_day: 'Сутки', past_3_days: '3 дня', past_week: 'Неделя',
  past_2_weeks: '2 недели', past_30_days: '30 дней',
};
const SENTIMENTS = new Set<RadarSentiment>(['negative', 'mixed', 'neutral', 'positive', 'no_data']);
const STANCES = new Set<RadarStance>(['wants_nerf', 'wants_buff', 'divided', 'indifferent', 'no_data']);

type Row = Record<string, unknown>;

class Skip extends Error {}

/** Ответ hs-data-api не похож на радар: последний хороший снимок остаётся в силе. */
export class RadarContractError extends Error {
  constructor(message: string) {
    super(`radar: ${message}`);
    this.name = 'RadarContractError';
  }
}

function invalid(message: string): never {
  throw new RadarContractError(message);
}

function record(value: unknown): Row | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : null;
}

function text(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maximum) : null;
}

function required(value: unknown, maximum: number): string {
  const result = text(value, maximum);
  if (result === null) throw new Skip();
  return result;
}

/** Любая принятая дата уходит дальше как ISO: её одинаково разбирают Node и все браузеры. */
function date(value: unknown): string | null {
  const result = text(value, 40);
  const time = result ? Date.parse(result) : Number.NaN;
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function percent(value: unknown): number | null {
  const result = finite(value);
  return result !== null && result >= 0 && result <= 100 ? Math.round(result * 100) / 100 : null;
}

function count(value: unknown): number | null {
  const result = finite(value);
  return result !== null && result >= 0 ? Math.round(result) : null;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function classKey(value: unknown): RadarClassKey {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if ((RADAR_CLASS_KEYS as readonly string[]).includes(normalized)) return normalized as RadarClassKey;
  return CLASS_ALIASES[normalized] ?? 'neutral';
}

export function radarPeriodLabel(period: string): string {
  if (PERIOD_LABELS[period]) return PERIOD_LABELS[period];
  const patch = /^patch_(\d+(?:\.\d+){1,3})$/.exec(period);
  if (patch) return `Патч ${patch[1]}`;
  // HSGuru называет окна дополнения по его имени: `black_empire`, `black_empire_ban`.
  if (period.endsWith('_ban')) return 'Баны';
  return /^[a-z]+(?:_[a-z]+)*$/.test(period) ? 'Дополнение' : period;
}

function postUrl(value: unknown, source: RadarPostSource): string | null {
  const raw = text(value, 2048);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && POST_HOSTS[source].test(url.hostname.toLowerCase()) ? url.toString() : null;
  } catch {
    return null;
  }
}

function parsePost(value: unknown): RadarPost | null {
  const row = record(value);
  const source = row?.platform ?? row?.source;
  if (!row || (source !== 'reddit' && source !== 'x')) return null;
  const url = postUrl(row.url, source);
  const postText = text(row.excerpt, 600) ?? text(row.text, 600);
  if (!url || !postText) return null;
  const kind = row.kind === 'comment' || row.kind === 'tweet' ? row.kind : 'post';
  return {
    source, kind, url, author: text(row.author, 80) ?? 'аноним', score: Math.round(finite(row.score) ?? 0),
    comments: count(row.comments), title: text(row.title, 300), text: postText, community: text(row.community, 80),
    publishedAt: date(row.createdAt ?? row.publishedAt), official: row.official === true,
  };
}

function trendPoint(value: unknown, rank: string, seen: Set<string>): RadarTrendPoint[] {
  const row = record(value);
  const period = text(row?.period, 40);
  if (!row || !period || (row.rank !== undefined && row.rank !== rank) || seen.has(period)) return [];
  seen.add(period);
  return [{
    period, label: radarPeriodLabel(period),
    winrate: percent(row.winrate ?? row.deckWinrate),
    popularity: percent(row.popularity ?? row.deckPopularity),
    games: count(row.games ?? row.timesPlayed),
  }];
}

function parseStats(value: unknown): RadarStats {
  const row = record(value) ?? {};
  const rank = text(row.rank, 40) ?? 'all';
  const period = text(row.period, 40) ?? '';
  const seen = new Set<string>();
  return {
    source: row.source === 'hsreplay' ? 'hsreplay' : 'hsguru',
    rankLabel: RANK_LABELS[rank] ?? rank,
    periodLabel: period ? radarPeriodLabel(period) : '',
    winrate: percent(row.winrate),
    popularity: percent(row.popularity),
    games: count(row.games ?? row.timesPlayed),
    trend: list(row.periods).flatMap(item => trendPoint(item, rank, seen)).slice(0, MAX_TREND),
  };
}

function parseSocial(value: unknown): RadarSocial {
  const row = record(value) ?? {};
  const mentions = record(row.mentions);
  const seen = new Set<string>();
  return {
    mentions: count(mentions?.total ?? row.mentions) ?? 0,
    reddit: count(mentions?.reddit) ?? 0,
    x: count(mentions?.x) ?? 0,
    sentiment: SENTIMENTS.has(row.sentiment as RadarSentiment) ? row.sentiment as RadarSentiment : 'no_data',
    stance: STANCES.has(row.stance as RadarStance) ? row.stance as RadarStance : 'no_data',
    summary: text(row.summary, 1200),
    posts: list(row.topPosts ?? row.posts).map(parsePost)
      .filter((post): post is RadarPost => post !== null && !seen.has(post.url) && Boolean(seen.add(post.url)))
      .slice(0, MAX_POSTS),
  };
}

function changeText(value: unknown): string | null {
  if (typeof value === 'string') return text(value, 300);
  const row = record(value);
  if (!row) return null;
  const label = text(row.label ?? row.field ?? row.stat ?? row.name, 60);
  const shown = (part: unknown) => (typeof part === 'number' && Number.isFinite(part) ? String(part) : text(part, 140));
  const before = shown(row.before ?? row.old ?? row.from);
  const after = shown(row.after ?? row.new ?? row.to);
  if (before !== null && after !== null) return `${label ? `${label}: ` : ''}${before} → ${after}`.slice(0, 320);
  return text(row.text ?? row.description ?? row.summary, 300);
}

function precedentStats(value: unknown): RadarPrecedentStats | null {
  const row = record(value);
  if (!row) return null;
  const stats = { winrate: percent(row.winrate ?? row.deckWinrate), popularity: percent(row.popularity ?? row.deckPopularity) };
  return stats.winrate === null && stats.popularity === null ? null : stats;
}

function parsePrecedent(value: unknown): RadarPrecedent | null {
  const row = record(value);
  const patch = patchVersion(row?.patch);
  const name = text(row?.name, 120);
  if (!row || !patch || !name || !/^\d+(?:\.\d+){1,2}$/.test(patch)) return null;
  const cardId = text(row.cardId, 60);
  return {
    id: text(row.id, 160) ?? `${patch}:${cardId ?? name}`,
    patch,
    date: date(row.date),
    name,
    classKey: classKey(row.class ?? row.classKey),
    direction: DIRECTIONS.has(row.direction as RadarPrecedent['direction']) ? row.direction as RadarPrecedent['direction'] : 'neutral',
    changes: list(row.changes).map(changeText).filter((change): change is string => change !== null).slice(0, 6),
    summary: text(row.summary, 600),
    before: precedentStats(row.preStats),
    after: precedentStats(row.postStats),
    similarity: list(row.similarity).map(item => text(item, 160)).filter((item): item is string => item !== null).slice(0, 4),
    cited: row.citedByModel === true,
    cardHref: cardId && /^[A-Za-z0-9_]+$/.test(cardId) ? `/standard/cards/wild/${cardId}/` : null,
    patchHref: `/standard/patches/?version=${encodeURIComponent(patch)}`,
  };
}

function parsePrecedents(value: unknown): RadarPrecedent[] {
  const seen = new Set<string>();
  return list(value).map(parsePrecedent)
    .filter((item): item is RadarPrecedent => item !== null && !seen.has(item.id) && Boolean(seen.add(item.id)))
    .sort((a, b) => Number(b.cited) - Number(a.cited))
    .slice(0, MAX_PRECEDENTS);
}

/** `history.patterns` (или `rules`): строки или объекты с заголовком и пояснением. */
function parsePatterns(value: unknown): RadarPattern[] {
  const history = record(value);
  return list(history?.patterns ?? history?.rules).flatMap(item => {
    if (typeof item === 'string') {
      const title = text(item, 300);
      return title ? [{ title, text: null, count: null }] : [];
    }
    const row = record(item);
    const title = text(row?.title ?? row?.label ?? row?.name ?? row?.pattern, 300);
    if (!row || !title) return [];
    return [{ title, text: text(row.text ?? row.summary ?? row.description, 800), count: count(row.count ?? row.cases ?? row.support) }];
  }).slice(0, MAX_PATTERNS);
}

function entityHref(kind: RadarKind, id: string): string | null {
  if (kind === 'card') return `/standard/cards/standard/${encodeURIComponent(id)}/`;
  return kind === 'archetype' ? `/standard/archetypes/standard/${encodeURIComponent(id)}/` : null;
}

function parseCandidate(value: unknown, nameArchetype: RadarArchetypeNamer): RadarCandidate | null {
  const row = record(value);
  if (!row || (row.kind !== 'card' && row.kind !== 'archetype' && row.kind !== 'class')) return null;
  const confidence = finite(row.confidence);
  if (confidence === null) return null;
  try {
    const kind = row.kind;
    const sourceId = required(row.id, 120);
    const sourceName = required(row.name, 120);
    const archetype = kind === 'archetype' ? nameArchetype(sourceId) : null;
    const id = archetype?.slug ?? sourceId;
    const previous = finite(record(row.dates)?.previousConfidence);
    const reasons = new Set(list(row.reasons).map(reason => text(reason, 400)).filter((reason): reason is string => reason !== null));
    return {
      id: text(row.ref, 160) ?? `${kind}:${sourceId}`,
      kind,
      entity: {
        id,
        dbfId: count(row.dbfId),
        name: archetype?.label ?? sourceName,
        nameEn: text(row.nameEn, 120) ?? (archetype && archetype.label !== sourceName ? sourceName : null),
        classKey: classKey(row.class ?? row.classKey),
        href: entityHref(kind, id),
      },
      confidence: Math.round(Math.max(0, Math.min(100, confidence))),
      previousConfidence: previous === null ? null : Math.round(Math.max(0, Math.min(100, previous))),
      headline: text(row.headline, 300),
      verdict: required(row.verdict, 2400),
      reasons: [...reasons].slice(0, MAX_REASONS),
      suggestedChange: text(row.suggestedChange, 400),
      stats: parseStats(row.stats),
      social: parseSocial(row.social),
      precedents: parsePrecedents(row.precedents),
      firstSeenAt: date(record(row.dates)?.firstFlaggedAt ?? row.firstSeenAt),
    };
  } catch (error) {
    if (error instanceof Skip) return null;
    throw error;
  }
}

function parseCandidates(value: unknown, label: string, nameArchetype: RadarArchetypeNamer): RadarCandidate[] {
  if (!Array.isArray(value)) invalid(`${label} must be an array`);
  const seen = new Set<string>();
  return value.map(item => parseCandidate(item, nameArchetype))
    .filter((candidate): candidate is RadarCandidate => {
      if (!candidate || seen.has(candidate.id)) return false;
      seen.add(candidate.id);
      return true;
    })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_CANDIDATES);
}

/**
 * Источники сводятся к поставщикам: hs-data-api перечисляет каждый срез
 * статистики отдельно (десяток срезов HSReplay), а странице нужен список
 * «откуда данные». Для соцсетей суммируется число собранных записей.
 */
function parseSources(value: unknown): RadarSource[] {
  const groups = new Map<string, RadarSource>();
  for (const item of list(value)) {
    const row = record(item);
    const id = text(row?.id, 120);
    if (!row || !id || (row.state !== undefined && row.state !== 'ok')) continue;
    const platform = text(row.platform, 40) ?? id.split(/[:_]/)[0];
    const group = platform === 'hsguru' ? { id: 'hsguru', label: 'HSGuru — архетипы и классы', social: false }
      : platform === 'hsreplay' ? { id: 'hsreplay', label: 'HSReplay — карты', social: false }
        : platform === 'reddit' ? { id: 'reddit', label: 'Reddit', social: true }
          : platform === 'x' ? { id: 'x', label: 'X', social: true }
            : null;
    if (!group) continue;
    const current = groups.get(group.id) ?? { id: group.id, label: group.label, items: null };
    const items = count(row.items);
    if (group.social && items !== null) current.items = (current.items ?? 0) + items;
    groups.set(group.id, current);
  }
  return [...groups.values()];
}

/** Версия патча без номера сборки: «37.0.0.254477» → «37.0.0». */
function patchVersion(value: unknown): string | null {
  const version = text(value, 40);
  return version ? version.split('.').slice(0, 3).join('.') : null;
}

const keepArchetypeName: RadarArchetypeNamer = name => ({ slug: name, label: name });

/**
 * Проверяет ответ hs-data-api (конверт `{ data }` или сам результат) и
 * приводит его к модели страницы. `nameArchetype` превращает имя HSGuru в
 * slug и русское имя сайта; без него архетип остаётся с исходным именем.
 */
export function parseRadarReport(
  value: unknown,
  { demo = false, nameArchetype = keepArchetypeName }: { demo?: boolean; nameArchetype?: RadarArchetypeNamer } = {},
): RadarReport {
  const envelope = record(value) ?? invalid('response must be an object');
  const row = record(envelope.data) ?? envelope;
  if (row.schemaVersion !== undefined && row.schemaVersion !== 1) invalid(`unsupported schemaVersion ${String(row.schemaVersion)}`);
  if (row.format !== undefined && row.format !== 'standard') invalid(`unexpected format ${String(row.format)}`);
  const generatedAt = date(row.generatedAt) ?? invalid('generatedAt must be a date');
  const summary = text(row.summary, 4000) ?? invalid('summary must be a string');
  const version = patchVersion(record(row.patch)?.version);
  const window = record(row.socialWindow ?? row.window);
  const from = date(window?.from);
  const to = date(window?.to);
  return {
    schemaVersion: 1,
    generatedAt,
    model: text(row.model, 80) ?? 'неизвестна',
    format: 'standard',
    patch: version ? { version, href: `/standard/patches/?version=${encodeURIComponent(version)}` } : null,
    window: from && to ? { from, to } : null,
    sources: parseSources(row.sources),
    summary,
    nerfs: parseCandidates(row.nerfs, 'nerfs', nameArchetype),
    buffs: parseCandidates(row.buffs, 'buffs', nameArchetype),
    patterns: parsePatterns(row.history),
    demo,
  };
}
