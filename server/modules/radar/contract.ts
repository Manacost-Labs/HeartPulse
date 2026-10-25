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
import { date, invalid, patchVersion, record, text } from './parsing.js';
import { parseHistory } from './precedents.js';
import type { RadarArchetypeNamer, RadarCandidate, RadarReport } from './types.js';

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

const keepArchetypeName: RadarArchetypeNamer = name => ({ slug: name, label: name });

/**
 * Тексты модели пишут архетипы именами HSGuru («Zoolock»); на странице
 * всё по-русски, поэтому известные имена заменяются переводами сайта.
 */
function localizeReport(report: RadarReport, localize: (value: string) => string): RadarReport {
  const many = (values: string[]) => values.map(localize);
  const one = (value: string | null) => (value === null ? null : localize(value));
  const candidate = (item: RadarCandidate): RadarCandidate => ({
    ...item,
    headline: one(item.headline), verdict: localize(item.verdict), reasons: many(item.reasons), suggestedChange: one(item.suggestedChange),
    social: { ...item.social, summary: one(item.social.summary) },
    precedents: item.precedents.map(precedent => ({ ...precedent, summary: one(precedent.summary) })),
  });
  return {
    ...report,
    summary: localize(report.summary),
    nerfs: report.nerfs.map(candidate),
    buffs: report.buffs.map(candidate),
    history: report.history && {
      ...report.history,
      summary: one(report.history.summary),
      patterns: report.history.patterns.map(pattern => ({ ...pattern, title: localize(pattern.title), text: one(pattern.text) })),
    },
  };
}

export type RadarParseOptions = {
  demo?: boolean;
  /** Имя HSGuru → slug и русское имя архетипа сайта; без него архетип остаётся с исходным именем. */
  nameArchetype?: RadarArchetypeNamer;
  /** Замена известных английских имён архетипов в текстах модели. */
  localize?: (value: string) => string;
};

/**
 * Проверяет ответ hs-data-api (конверт `{ data }` или сам результат) и
 * приводит его к модели страницы. Версии схемы hs-data-api только
 * добавляют поля, поэтому принимается любая версия от 1.
 */
export function parseRadarReport(
  value: unknown,
  { demo = false, nameArchetype = keepArchetypeName, localize }: RadarParseOptions = {},
): RadarReport {
  const envelope = record(value) ?? invalid('response must be an object');
  const row = record(envelope.data) ?? envelope;
  const schemaVersion = row.schemaVersion;
  if (schemaVersion !== undefined && !(Number.isInteger(schemaVersion) && (schemaVersion as number) >= 1)) {
    invalid(`unsupported schemaVersion ${String(schemaVersion)}`);
  }
  if (row.format !== undefined && row.format !== 'standard') invalid(`unexpected format ${String(row.format)}`);
  const generatedAt = date(row.generatedAt) ?? invalid('generatedAt must be a date');
  const summary = text(row.summary, 4000) ?? invalid('summary must be a string');
  const version = patchVersion(record(row.patch)?.version);
  const window = record(row.socialWindow ?? row.window);
  const from = date(window?.from);
  const to = date(window?.to);
  const report: RadarReport = {
    schemaVersion: 1,
    generatedAt,
    model: text(row.model, 80) ?? 'неизвестна',
    format: 'standard',
    patch: version ? { version, href: `/standard/patches/?version=${encodeURIComponent(version)}` } : null,
    window: from && to ? { from, to } : null,
    summary,
    nerfs: parseCandidates(row.nerfs, 'nerfs', nameArchetype),
    buffs: parseCandidates(row.buffs, 'buffs', nameArchetype),
    history: parseHistory(row.history),
    demo,
  };
  return localize ? localizeReport(report, localize) : report;
}
