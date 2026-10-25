/** Поля схемы 2 hs-data-api: прогноз правки, цифры, калибровка, тренд, окно патча, изменения с прошлого прогона. */
import { count, date, finite, list, record, text } from './parsing.js';
import type {
  RadarArchetypeNamer, RadarChangeItem, RadarChanges, RadarForecast, RadarKind, RadarPredictedChange, RadarTiming,
} from './types.js';

const FIELDS = new Set<RadarPredictedChange['field']>(['cost', 'attack', 'health', 'durability', 'armor', 'text', 'other']);
const TRENDS = new Set(['new', 'up', 'down', 'stable']);
const MAX_HISTORY = 30;
const MAX_CHANGE_ITEMS = 5;

const clampPercent = (value: unknown) => {
  const result = finite(value);
  return result === null ? null : Math.round(Math.max(0, Math.min(100, result)));
};

function predictedChange(value: unknown): RadarPredictedChange | null {
  const row = record(value);
  const change = text(row?.change, 200);
  if (!row || !change) return null;
  const field = FIELDS.has(row.field as RadarPredictedChange['field']) ? row.field as RadarPredictedChange['field'] : 'other';
  const stat = (part: unknown) => (field === 'text' || field === 'other' ? null : finite(part));
  return { change, field, before: stat(row.before), after: stat(row.after), probability: clampPercent(row.probability) };
}

export function parseForecast(row: Record<string, unknown>): RadarForecast {
  const calibration = record(row.calibration);
  const rate = finite(calibration?.historicalRate);
  const samples = count(calibration?.samples);
  const trend = record(row.trend);
  return {
    keyNumbers: list(row.keyNumbers).map(item => text(item, 300)).filter((item): item is string => item !== null).slice(0, 6),
    predictedChanges: list(row.predictedChanges).map(predictedChange).filter((item): item is RadarPredictedChange => item !== null)
      .sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0)).slice(0, 3),
    metaImpact: text(row.metaImpact, 600),
    calibration: rate !== null && rate >= 0 && rate <= 1 && samples
      ? { rate: Math.round(rate * 100), hits: count(calibration?.hits) ?? 0, samples } : null,
    trend: trend && TRENDS.has(trend.status as string)
      ? { status: trend.status as 'new' | 'up' | 'down' | 'stable', delta: finite(trend.delta) } : null,
    confidenceHistory: list(row.confidenceHistory).flatMap(item => {
      const point = record(item);
      const at = date(point?.generatedAt);
      const confidence = clampPercent(point?.confidence);
      return at && confidence !== null ? [{ at, confidence }] : [];
    }).slice(-MAX_HISTORY),
  };
}

export function parseTiming(value: unknown): RadarTiming | null {
  const row = record(value);
  if (!row) return null;
  const share = (part: unknown) => {
    const result = finite(part);
    return result === null || result < 0 || result > 1 ? null : Math.round(result * 100);
  };
  const timing = {
    within7: share(row.nextPatchWithin7Days), within14: share(row.nextPatchWithin14Days),
    daysSinceLastPatch: count(row.daysSinceLastBalancePatch), outlook: text(row.outlook, 600),
  };
  return timing.within7 === null && timing.within14 === null && !timing.outlook ? null : timing;
}

function changeItems(value: unknown, nameArchetype: RadarArchetypeNamer): RadarChangeItem[] {
  return list(value).flatMap(item => {
    const row = record(item);
    const name = text(row?.name, 120);
    const kind = row?.kind;
    if (!row || !name || (kind !== 'card' && kind !== 'archetype' && kind !== 'class')) return [];
    return [{
      side: row.side === 'buffs' ? 'buffs' as const : 'nerfs' as const,
      kind: kind as RadarKind,
      name: kind === 'archetype' ? nameArchetype(name).label : name,
      confidence: clampPercent(row.confidence),
      delta: finite(row.delta),
    }];
  }).slice(0, MAX_CHANGE_ITEMS);
}

export function parseChanges(value: unknown, nameArchetype: RadarArchetypeNamer): RadarChanges | null {
  const row = record(value);
  if (!row) return null;
  const changes = {
    previousAt: date(row.previousGeneratedAt),
    added: changeItems(row.added, nameArchetype), removed: changeItems(row.removed, nameArchetype),
    risen: changeItems(row.risen, nameArchetype), fallen: changeItems(row.fallen, nameArchetype),
  };
  return changes.added.length + changes.removed.length + changes.risen.length + changes.fallen.length ? changes : null;
}
