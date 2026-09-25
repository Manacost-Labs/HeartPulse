export type WildArchetype = {
  nameEn: string;
  nameRu: string;
  classLabel: string;
  winRate: number | null;
  games: number | null;
};

export type WildDeck = {
  title: string;
  deckCode: string;
  winRate: number | null;
  games: number | null;
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  return value.trim().slice(0, maxLength) || null;
}

function rate(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
    ? value : null;
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** Reads only the bounded fields needed by the private Wild archetype catalog. */
export function readWildArchetypes(payload: unknown): WildArchetype[] {
  if (!record(payload) || !Array.isArray(payload.items)) throw new Error('Некорректный каталог архетипов');
  return payload.items.slice(0, 1000).flatMap((value: unknown) => {
    if (!record(value) || value.wild !== true) return [];
    const nameEn = text(value.nameEn, 120);
    if (!nameEn) return [];
    const stats = record(value.stats) ? value.stats : {};
    return [{
      nameEn,
      nameRu: text(value.nameRu, 120) ?? nameEn,
      classLabel: text(value.classLabel, 80) ?? 'Без класса',
      winRate: rate(stats.winRate),
      games: count(stats.games),
    }];
  });
}

/** Drops malformed deck codes before they can become builder deep links. */
export function readWildDecks(payload: unknown, fallbackTitle: string): WildDeck[] {
  if (!record(payload) || !Array.isArray(payload.decks)) throw new Error('Некорректный список колод');
  return payload.decks.slice(0, 100).flatMap((value: unknown) => {
    if (!record(value)) return [];
    const deckCode = text(value.deck_code, 500);
    if (!deckCode || !/^[A-Za-z0-9+/=]{20,500}$/.test(deckCode)) return [];
    return [{
      title: text(value.title, 160) ?? fallbackTitle,
      deckCode,
      winRate: rate(value.win_rate),
      games: count(value.games),
    }];
  });
}
