type JsonRecord = Record<string, unknown>;

export type BattlegroundStrategyAuditStatus = 'healthy' | 'degraded' | 'invalid';

export type BattlegroundStrategyAudit = {
  ok: boolean;
  status: BattlegroundStrategyAuditStatus;
  source: string | null;
  fetchedAt: string | null;
  count: number;
  tierCounts: Record<string, number>;
  strategiesWithCards: number;
  strategiesWithMetrics: number;
  issues: string[];
};

const TIERS = ['S', 'A', 'B', 'C', 'D'] as const;
const METRIC_FIELDS = [
  'games',
  'avgPlacement',
  'averagePlacement',
  'popularity',
  'firstPlace',
  'winrate',
] as const;

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function rowsForTier(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(item => item && typeof item === 'object' && !Array.isArray(item)) as JsonRecord[] : [];
}

function strategyRows(payload: JsonRecord): { rows: JsonRecord[]; tierCounts: Record<string, number> } {
  const tiers = record(payload.tiers);
  const rows: JsonRecord[] = [];
  const tierCounts: Record<string, number> = {};
  for (const tier of TIERS) {
    const tierRows = rowsForTier(tiers[tier]);
    tierCounts[tier] = tierRows.length;
    rows.push(...tierRows.map(row => ({ ...row, __tier: tier })));
  }
  return { rows, tierCounts };
}

function hasCards(row: JsonRecord): boolean {
  return ['cards', 'coreCards', 'additionalCards', 'mainCards'].some(field => {
    const value = row[field];
    return Array.isArray(value) && value.length > 0;
  });
}

function hasMetrics(row: JsonRecord): boolean {
  return METRIC_FIELDS.some(field => {
    const value = row[field];
    return value !== null && value !== undefined && value !== '';
  });
}

export function auditBattlegroundStrategyPayload(payload: unknown): BattlegroundStrategyAudit {
  const root = record(payload);
  const source = nonEmptyString(root.source);
  const fetchedAt = nonEmptyString(root.fetchedAt) ?? nonEmptyString(root.fetched_at);
  const { rows, tierCounts } = strategyRows(root);
  const advertisedCount = typeof root.count === 'number' && Number.isSafeInteger(root.count)
    ? root.count
    : null;
  const strategiesWithCards = rows.filter(hasCards).length;
  const strategiesWithMetrics = rows.filter(hasMetrics).length;
  const issues: string[] = [];

  if (!source) issues.push('missing_source');
  if (!fetchedAt) issues.push('missing_fetched_at');
  if (rows.length === 0) issues.push('empty_strategy_list');
  if (advertisedCount !== null && advertisedCount !== rows.length) {
    issues.push(`count_mismatch:${advertisedCount}:${rows.length}`);
  }
  if (rows.length >= 3 && strategiesWithCards < Math.max(3, Math.ceil(rows.length * 0.5))) {
    issues.push(`insufficient_card_coverage:${strategiesWithCards}/${rows.length}`);
  }
  if (
    source === 'hsreplay'
    && rows.length >= 5
    && tierCounts.D === rows.length
    && strategiesWithMetrics === 0
  ) {
    issues.push('hsreplay_collapsed_d_tiers_without_metrics');
  }

  const status: BattlegroundStrategyAuditStatus = rows.length === 0 || issues.some(issue => issue.startsWith('count_mismatch') || issue === 'hsreplay_collapsed_d_tiers_without_metrics')
    ? 'invalid'
    : issues.length > 0
      ? 'degraded'
      : 'healthy';
  return {
    ok: status === 'healthy',
    status,
    source,
    fetchedAt,
    count: rows.length,
    tierCounts,
    strategiesWithCards,
    strategiesWithMetrics,
    issues,
  };
}
