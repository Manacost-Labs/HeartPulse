const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Exclude every group's key legendary, including keys repeated in another group. */
export function companionIdsFromLegendaries(value: unknown): Set<string> {
  if (!object(value) || !Array.isArray(value.groups)) return new Set();
  const keyIds = new Set<string>();
  for (const group of value.groups) {
    if (object(group) && object(group.keyCard) && typeof group.keyCard.cardId === 'string') {
      keyIds.add(group.keyCard.cardId);
    }
  }
  const companions = new Set<string>();
  for (const group of value.groups) {
    if (!object(group) || !Array.isArray(group.cards)) continue;
    for (const card of group.cards) {
      if (object(card) && typeof card.cardId === 'string' && !keyIds.has(card.cardId)) {
        companions.add(card.cardId);
      }
    }
  }
  return companions;
}

export async function loadArenaCompanionIds(request: typeof fetch, signal?: AbortSignal): Promise<Set<string>> {
  try {
    const response = await request('/api/legendaries?source=hsreplay&v=ru_cards_v4', {
      cache: 'no-cache', credentials: 'same-origin', signal,
    });
    return response.ok ? companionIdsFromLegendaries(await response.json()) : new Set();
  } catch { return new Set(); }
}
