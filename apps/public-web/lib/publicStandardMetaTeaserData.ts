import {
  parseStandardMetaApiResponse,
  type StandardMetaData,
  type StandardMetaFormat,
} from '@/shared/standardMetaContract';
import type { StandardMetaTeaserSeed } from '@/src/features/standardMetaTeaser';

/** The open general slice of Standard: every archetype row, the filters fixed by the server. */
export function standardMetaPublicPath(format: StandardMetaFormat = 'standard'): string {
  return `/api/standard-meta/public?format=${format}`;
}

// The open slice carries no paid column: a row that brings one is not an open row.
const PAID_FIELDS = ['turns', 'durationMinutes', 'climbingSpeed'] as const;

function publicData(raw: unknown): StandardMetaData | null {
  if (raw === null || raw === undefined) return null;
  try {
    const { data } = parseStandardMetaApiResponse(raw, Date.now(), true);
    return data.items.length > 0 && data.items.every(item => PAID_FIELDS.every(field => item[field] === null)) ? data : null;
  } catch {
    return null;
  }
}

/** Loads the open general slice a guest sees first, or `null` to let the browser load it. */
export async function loadStandardMetaTeaserSeed(
  read: (path: string) => Promise<unknown>,
): Promise<StandardMetaTeaserSeed | null> {
  const data = publicData(await read(standardMetaPublicPath()));
  return data ? { period: data.period, data } : null;
}
