function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Rejects broken upstream documents before legacy normalization can turn them into an empty catalog. */
export function assertArchetypeCatalogSource(value: unknown): void {
  const invalid = () => new Error('Invalid archetype catalog source');
  if (!record(value) || !Array.isArray(value.data)) throw invalid();
  for (const key of ['meta', 'criteria', 'coverage']) {
    if (value[key] != null && !record(value[key])) throw invalid();
  }
  const updatedAt = record(value.meta) ? value.meta.fetched_at : null;
  if (updatedAt != null && (typeof updatedAt !== 'string' || !Number.isFinite(Date.parse(updatedAt)))) {
    throw invalid();
  }
  for (const row of value.data) {
    if (!record(row) || typeof row.archetype !== 'string' || !row.archetype.trim()) throw invalid();
    if (row.decks == null) continue;
    if (!Array.isArray(row.decks)) throw invalid();
    for (const deck of row.decks) {
      if (!record(deck) || (deck.deck_code != null && typeof deck.deck_code !== 'string')) throw invalid();
    }
  }
}
