import { encode, type FormatType } from '@firestone-hs/deckstrings';
// @ts-ignore: node:sqlite is available in the production Node 22 runtime.
import type { DatabaseSync } from 'node:sqlite';
import { matchArchetypeByDeckCode } from './deckBuilderResolve.js';

export type ArchetypeDeckCandidate = {
  nameEn: string;
  deckCode: string;
};

export type ArchetypeDeckIdentity = {
  sourceNameEn: string;
  canonicalNameEn: string;
  canonicalNameRu: string;
  identitySource: 'hsguru' | 'local-deck-match' | 'hsreplay';
  identityConfidence: number;
};

type ArchetypeDetailPayload = {
  snapshot?: {
    name?: string | null;
    player_class?: string | null;
  } | null;
  decks?: Array<{
    total_games?: number | null;
    cards?: Array<{
      dbf_id?: number | null;
      count?: number | null;
      sideboard?: number | boolean | null;
    }> | null;
  }> | null;
};

const HERO_DBF_BY_CLASS: Record<string, number> = {
  WARRIOR: 7,
  SHAMAN: 1066,
  ROGUE: 930,
  PALADIN: 671,
  HUNTER: 31,
  DRUID: 274,
  WARLOCK: 893,
  MAGE: 637,
  PRIEST: 813,
  DEMONHUNTER: 56550,
  DEATHKNIGHT: 78065,
};

const identityLookupCache = new Map<string, { expiresAt: number; name: string | null }>();

export function loadArchetypeDeckCandidates(
  database: DatabaseSync,
  format?: 'standard' | 'wild',
): ArchetypeDeckCandidate[] {
  try {
    const rows = database.prepare(`
      SELECT name_en AS nameEn, deck_code AS deckCode
      FROM archetype_deck_codes
      WHERE deck_code IS NOT NULL AND length(trim(deck_code)) >= 20
        AND (? IS NULL OR lower(format) = ?)
      ORDER BY updated_at DESC
      LIMIT 500
    `).all(format || null, format || null) as Array<{ nameEn?: string; deckCode?: string }>;
    return rows.flatMap(row => {
      const nameEn = String(row.nameEn ?? '').trim();
      const deckCode = String(row.deckCode ?? '').trim();
      return nameEn && deckCode ? [{ nameEn, deckCode }] : [];
    });
  } catch {
    return [];
  }
}

function classKey(value: unknown): string {
  return String(value ?? '').trim().toUpperCase().replace(/[\s_-]+/g, '');
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function buildArchetypeDeckCode(payload: ArchetypeDetailPayload): string {
  const heroDbfId = HERO_DBF_BY_CLASS[classKey(payload?.snapshot?.player_class)];
  if (!heroDbfId) return '';
  const decks = Array.isArray(payload?.decks) ? [...payload.decks] : [];
  decks.sort((left, right) => (finite(right.total_games) ?? 0) - (finite(left.total_games) ?? 0));
  for (const deck of decks) {
    const cards = (Array.isArray(deck?.cards) ? deck.cards : []).flatMap(card => {
      if (card?.sideboard) return [];
      const dbfId = Number(card?.dbf_id);
      const count = Math.max(1, Math.round(finite(card?.count) ?? 1));
      return Number.isSafeInteger(dbfId) && dbfId > 0 && dbfId <= 10_000_000
        ? [[dbfId, count] as [number, number]]
        : [];
    });
    if (!cards.length) continue;
    try {
      return encode({
        format: 2 as FormatType,
        heroes: [heroDbfId],
        cards,
      });
    } catch {
      // Try the next build when an upstream card row cannot be encoded.
    }
  }
  return '';
}

export async function fetchHsGuruArchetypeName(deckCode: string): Promise<string | null> {
  const now = Date.now();
  const cached = identityLookupCache.get(deckCode);
  if (cached && cached.expiresAt > now) return cached.name;
  try {
    const response = await fetch(`https://www.hsguru.com/api/deck-info/${encodeURIComponent(deckCode)}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)',
      },
      signal: AbortSignal.timeout(1_800),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { archetype?: string; name?: string };
    const name = String(payload?.archetype || payload?.name || '').trim() || null;
    identityLookupCache.set(deckCode, { expiresAt: now + 30 * 60_000, name });
    return name;
  } catch {
    identityLookupCache.set(deckCode, { expiresAt: now + 2 * 60_000, name: null });
    return null;
  }
}

export async function resolveArchetypeDeckIdentity({
  payload,
  candidates,
  translate,
  lookupHsGuru = fetchHsGuruArchetypeName,
}: {
  payload: ArchetypeDetailPayload;
  candidates: ArchetypeDeckCandidate[];
  translate: (name: string) => Promise<string> | string;
  lookupHsGuru?: (deckCode: string) => Promise<string | null>;
}): Promise<ArchetypeDeckIdentity> {
  const sourceNameEn = String(payload?.snapshot?.name || '').trim();
  const deckCode = buildArchetypeDeckCode(payload);
  if (deckCode) {
    const hsguruName = await lookupHsGuru(deckCode).catch(() => null);
    if (hsguruName) {
      const canonicalNameRu = String(await translate(hsguruName) || hsguruName).trim() || hsguruName;
      return {
        sourceNameEn,
        canonicalNameEn: hsguruName,
        canonicalNameRu,
        identitySource: 'hsguru',
        identityConfidence: 1,
      };
    }
    const localMatch = matchArchetypeByDeckCode(deckCode, candidates);
    if (localMatch) {
      const canonicalNameRu = String(await translate(localMatch.nameEn) || localMatch.nameEn).trim() || localMatch.nameEn;
      return {
        sourceNameEn,
        canonicalNameEn: localMatch.nameEn,
        canonicalNameRu,
        identitySource: 'local-deck-match',
        identityConfidence: localMatch.score,
      };
    }
  }
  const canonicalNameEn = sourceNameEn;
  const canonicalNameRu = canonicalNameEn
    ? String(await translate(canonicalNameEn) || canonicalNameEn).trim() || canonicalNameEn
    : '';
  return {
    sourceNameEn,
    canonicalNameEn,
    canonicalNameRu,
    identitySource: 'hsreplay',
    identityConfidence: 0,
  };
}
