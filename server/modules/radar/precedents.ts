/** Прошлые правки Blizzard у кандидата и история патчей прогона. */
import { classKey, count, date, list, patchVersion, percent, record, text, type Row } from './parsing.js';
import type { RadarArchetypeNamer, RadarHistory, RadarPattern, RadarPrecedent, RadarPrecedentStats } from './types.js';

const MAX_PRECEDENTS = 3;
const MAX_PATTERNS = 8;
const CHANGE_FIELDS: Record<string, string> = {
  cost: 'Стоимость', attack: 'Атака', health: 'Здоровье', durability: 'Прочность', armor: 'Броня', text: 'Текст',
};
const SIMILARITY_LABELS: Record<string, string | null> = {
  same_card: 'та же карта', same_archetype: 'тот же архетип', same_class: 'тот же класс', similar_winrate: 'похожий винрейт',
  similar_popularity: 'похожая популярность', new_set_card: 'карта нового набора', cited: null,
};
const DIRECTIONS = new Set<RadarPrecedent['direction']>(['nerf', 'buff', 'rework', 'neutral']);


function changeText(value: unknown): string | null {
  if (typeof value === 'string') return text(value, 300);
  const row = record(value);
  if (!row) return null;
  const field = text(row.label ?? row.field ?? row.stat ?? row.name, 60);
  const label = field ? CHANGE_FIELDS[field.toLowerCase()] ?? field : null;
  const shown = (part: unknown) => (typeof part === 'number' && Number.isFinite(part) ? String(part) : text(part, 140));
  const before = shown(row.before ?? row.old ?? row.from);
  const after = shown(row.after ?? row.new ?? row.to);
  if (before !== null && after !== null) return `${label ? `${label}: ` : ''}${before} → ${after}`.slice(0, 320);
  return text(row.text ?? row.description ?? row.summary, 300);
}

function precedentStats(value: unknown, nameArchetype: RadarArchetypeNamer): RadarPrecedentStats | null {
  const row = record(value);
  if (!row) return null;
  const archetype = text(row.archetype, 120);
  const stats = {
    archetype: archetype && nameArchetype(archetype).label,
    winrate: percent(row.winrate ?? row.deckWinrate),
    popularity: percent(row.popularity ?? row.deckPopularity),
  };
  return stats.winrate === null && stats.popularity === null ? null : stats;
}

/** Правка текста карты одной строкой; длинные тексты обрезаются, полный текст — в патчноуте. */
function textChange(row: Row): string | null {
  const clip = (value: unknown) => {
    const result = text(value, 400);
    return result && result.length > 140 ? `${result.slice(0, 139)}…` : result;
  };
  const before = clip(row.textBefore);
  const after = clip(row.textAfter);
  return before && after ? `Текст: «${before}» → «${after}»` : null;
}

function similarity(value: unknown): string[] {
  return list(value).flatMap(item => {
    const code = text(item, 160);
    if (!code) return [];
    if (Object.hasOwn(SIMILARITY_LABELS, code)) return SIMILARITY_LABELS[code] ? [SIMILARITY_LABELS[code] as string] : [];
    return /^[a-z]+(?:_[a-z]+)+$/.test(code) ? [] : [code];
  }).slice(0, 4);
}

function parsePrecedent(value: unknown, nameArchetype: RadarArchetypeNamer): RadarPrecedent | null {
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
    changes: [...list(row.changes).map(changeText), textChange(row)].filter((change): change is string => change !== null).slice(0, 6),
    summary: text(row.summary, 600),
    setAgeDays: count(row.setAgeDays),
    before: precedentStats(row.preStats, nameArchetype),
    after: precedentStats(row.postStats, nameArchetype),
    similarity: similarity(row.similarity),
    cited: row.citedByModel === true,
    cardHref: cardId && /^[A-Za-z0-9_]+$/.test(cardId) ? `/standard/cards/wild/${cardId}/` : null,
    patchHref: `/standard/patches/?version=${encodeURIComponent(patch)}`,
  };
}

export function parsePrecedents(value: unknown, nameArchetype: RadarArchetypeNamer): RadarPrecedent[] {
  const seen = new Set<string>();
  return list(value).map(item => parsePrecedent(item, nameArchetype))
    .filter((item): item is RadarPrecedent => item !== null && !seen.has(item.id) && Boolean(seen.add(item.id)))
    .sort((a, b) => Number(b.cited) - Number(a.cited))
    .slice(0, MAX_PRECEDENTS);
}

/** `history.patterns`: строки или объекты `{ title, detail }`. */
function parsePatterns(history: Row): RadarPattern[] {
  return list(history.patterns ?? history.rules).flatMap(item => {
    if (typeof item === 'string') {
      const title = text(item, 300);
      return title ? [{ title, text: null, count: null }] : [];
    }
    const row = record(item);
    const title = text(row?.title ?? row?.label ?? row?.name ?? row?.pattern, 300);
    if (!row || !title) return [];
    return [{ title, text: text(row.detail ?? row.text ?? row.summary ?? row.description, 800), count: count(row.count ?? row.cases ?? row.support) }];
  }).slice(0, MAX_PATTERNS);
}

/** `history` прогона; у прогонов до истории патчей он `null`, и секции нет. */
export function parseHistory(value: unknown): RadarHistory | null {
  const history = record(value);
  if (!history) return null;
  const coverage = record(history.coverage);
  const result = {
    summary: text(history.summary, 2000),
    balancePatches: Array.isArray(history.balancePatches) ? history.balancePatches.length : count(history.balancePatches),
    from: date(coverage?.from),
    to: date(coverage?.to),
    patterns: parsePatterns(history),
  };
  return result.summary || result.patterns.length ? result : null;
}
