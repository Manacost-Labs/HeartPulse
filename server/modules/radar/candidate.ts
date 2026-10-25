/** Один кандидат на нерф или бафф: сущность, вывод модели, статистика, обсуждения, прецеденты. */
import { Skip, classKey, count, date, finite, list, record, required, text } from './parsing.js';
import { parseForecast } from './forecast.js';
import { parsePrecedents } from './precedents.js';
import { parseSocial, parseStats } from './social.js';
import type { RadarArchetypeNamer, RadarCandidate, RadarKind } from './types.js';

const MAX_REASONS = 8;

function entityHref(kind: RadarKind, id: string): string | null {
  if (kind === 'card') return `/standard/cards/standard/${encodeURIComponent(id)}/`;
  return kind === 'archetype' ? `/standard/archetypes/standard/${encodeURIComponent(id)}/` : null;
}

export function parseCandidate(value: unknown, nameArchetype: RadarArchetypeNamer): RadarCandidate | null {
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
      precedents: parsePrecedents(row.precedents, nameArchetype),
      firstSeenAt: date(record(row.dates)?.firstFlaggedAt ?? row.firstSeenAt),
      forecast: parseForecast(row),
    };
  } catch (error) {
    if (error instanceof Skip) return null;
    throw error;
  }
}
