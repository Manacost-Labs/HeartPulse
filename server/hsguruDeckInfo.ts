export type HsguruDeckInfo = { archetype: string; name: string };

export function hsguruStreamerRows(payload: any): unknown[] {
  const table = payload?.data?.tables?.[0] ?? payload?.tables?.[0] ?? null;
  return Array.isArray(table?.rows) ? table.rows : [];
}

export function hsguruStreamerDeckCodes(payload: any): string[] {
  const codes = new Set<string>();
  for (const row of hsguruStreamerRows(payload)) {
    if (!Array.isArray(row)) continue;
    const match = String(row[0] ?? '').match(/^###\s+.+?\s+([A-Za-z0-9+/=]{40,})\s+#/);
    if (match) codes.add(match[1]);
  }
  return [...codes];
}

export function hsguruStreamerArchetype(
  deckCode: string,
  title: string,
  deckInfo: Map<string, HsguruDeckInfo>,
): string {
  return deckInfo.get(deckCode)?.archetype || title;
}
