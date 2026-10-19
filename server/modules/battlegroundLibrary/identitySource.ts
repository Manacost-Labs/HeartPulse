/** The deadline also covers body parsing and the authoritative catalog fallback. */
export async function readBattlegroundLibraryIdentity<Card extends { dbfId: number }>({
  fetchImpl, catalogOrigin, dbfId, timeoutMs, project, fallback,
}: { fetchImpl: typeof fetch; catalogOrigin: string; dbfId: number; timeoutMs: number;
  project: (raw: unknown) => Card | null; fallback: () => Promise<Card[]>;
}): Promise<Card | undefined> {
  const controller = new AbortController();
  return withBattlegroundLibraryDeadline((async () => {
    try {
      const result = await fetchImpl(`${catalogOrigin}/api/bg/library/cards/by-dbf/${dbfId}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json', 'User-Agent': 'HearthPulse/BattlegroundLibrarySEO' },
      });
      if (result.ok) {
        const card = project(await result.json());
        if (card?.dbfId === dbfId) return card;
      } else await result.body?.cancel();
    } catch (error) {
      if (controller.signal.aborted) throw error;
    }
    // The legacy proxy maps absence to 502. That alone cannot prove a 404.
    return (await fallback()).find(card => card.dbfId === dbfId);
  })(), timeoutMs, controller);
}

/** The race bounds adapters that ignore AbortSignal; cancellation still reaches cooperative reads. */
export async function withBattlegroundLibraryDeadline<T>(promise: Promise<T>, timeoutMs: number, controller: AbortController): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('Battleground library catalog deadline exceeded'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
