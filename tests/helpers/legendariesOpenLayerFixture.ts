/**
 * The legendary groups as Express answers them, for the open-layer tests. The
 * protected answer carries sentinel values; the open answer is what
 * `GET /api/legendaries/public` returns by contract (#437), plus noise a
 * projection must never let through (a paid figure that slipped in).
 */
export const SENTINELS = ['91.234', '87.654', '77.777', '66.666'];
export const SENTINEL_VALUES = [91.234, 87.654, 77.777, 66.666];

const card = (cardId: string, name: string, extra: Record<string, unknown> = {}) => ({
  cardId, name, cost: 7, type: 'minion', rarity: 'legendary', classKey: 'any', count: 1,
  imageRu: `/api/card-image/${cardId}.webp`, imageHa: `/api/card-image/${cardId}-ha.webp`, ...extra,
});

const GROUPS = [
  { id: 'LEG_A', name: 'Ярость Альфа', companions: ['Спутник Первый', 'Спутник Второй'], classKey: 'mage', winRate: 61.4, pickRate: 33.3, totalGames: 4210 },
  { id: 'LEG_B', name: 'Бета Властелин', companions: ['Спутник Третий'], classKey: 'any', winRate: 58.2, pickRate: 21.5, totalGames: 3120 },
  { id: 'LEG_C', name: 'Гамма Страж', companions: [], classKey: 'priest', winRate: 52.9, pickRate: 12.7, totalGames: 1800 },
];

export function openAnswer({ noise = false, warning, sourceId = 'hsreplay' }: { noise?: boolean; warning?: string; sourceId?: string } = {}) {
  return {
    updatedAt: '2026-11-18T09:30:00.000Z', source: sourceId === 'firestone' ? 'firestoneapp.com' : 'hsreplay.net', sourceId,
    ...(warning ? { warning } : {}),
    paidMetrics: { offerRate: true, score: sourceId !== 'firestone' },
    groups: GROUPS.map((group, index) => ({
      classKey: group.classKey, winRate: group.winRate, pickRate: group.pickRate, totalGames: group.totalGames,
      keyCard: card(group.id, group.name),
      cards: group.companions.map((name, i) => card(`${group.id}_C${i}`, name, { rarity: 'rare' })),
      byClass: { all: { winRate: group.winRate, pickRate: group.pickRate },
        mage: { winRate: group.winRate - 1, pickRate: group.pickRate + 1 } },
      ...(noise ? { offerRate: 91.234, score: 87.654, arenaScore: 87.654, futureMetric: 55.555 } : {}),
      ...(noise ? { _index: index } : {}),
    })).map(group => noise
      ? { ...group, keyCard: { ...group.keyCard, drawnWinrate: 77.777, offerRate: 91.234, arenaSmithTier: 'S' },
        byClass: { ...group.byClass, all: { ...group.byClass.all, offerRate: 91.234, score: 87.654 } } }
      : group),
  };
}

/**
 * The protected answer of a subscriber: every group has the paid figures. The first group carries the
 * sentinels; the other two give a different order by `score`, so a sort by it is visible.
 */
export function protectedAnswer({ sourceId = 'hsreplay' }: { sourceId?: string } = {}) {
  const open = openAnswer({ sourceId });
  const paid = [{ offerRate: 91.234, score: 87.654 }, { offerRate: 30.5, score: 40.2 }, { offerRate: 50.1, score: 95.5 }];
  return { ...open, paidMetrics: undefined, groups: open.groups.map((group, index) => ({
    ...group, ...paid[index],
    keyCard: { ...group.keyCard, drawnWinrate: 77.777, offerRate: paid[index].offerRate, arenaScore: paid[index].score },
    byClass: { all: { winRate: group.winRate, pickRate: group.pickRate, ...paid[index] },
      mage: { winRate: group.winRate - 1, pickRate: group.pickRate + 1, offerRate: index === 0 ? 66.666 : 10, score: paid[index].score } },
  })) };
}
