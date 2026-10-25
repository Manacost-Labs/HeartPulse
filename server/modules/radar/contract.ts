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

import { parseCandidate } from './candidate.js';
import { count, date, invalid, list, patchVersion, record, text } from './parsing.js';
import { parseHistory } from './precedents.js';
import type { RadarArchetypeNamer, RadarCandidate, RadarReport, RadarSource } from './types.js';

export * from './types.js';
export { RadarContractError } from './parsing.js';
export { radarPeriodLabel } from './social.js';

const MAX_CANDIDATES = 30;

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
    history: parseHistory(row.history),
    demo,
  };
}
