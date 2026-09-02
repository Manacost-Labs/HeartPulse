export const BATTLEGROUND_STATISTICS_SCHEMAS = {
  BattlegroundStrategyPublication: {
    type: 'object',
    additionalProperties: false,
    required: ['mode', 'channel', 'publishedAt'],
    properties: {
      mode: { type: ['string', 'null'], maxLength: 32 },
      channel: { type: ['string', 'null'], maxLength: 32 },
      publishedAt: { type: ['string', 'null'], format: 'date-time' },
      stale: { type: 'boolean' },
    },
  },
  BattlegroundUpstreamFreshness: {
    type: 'object',
    additionalProperties: false,
    required: ['status', 'observedAt', 'ageSeconds', 'bodyAsOf'],
    properties: {
      status: { type: 'string', enum: ['fresh', 'stale', 'unknown'] },
      observedAt: { type: ['string', 'null'], format: 'date-time' },
      ageSeconds: { type: ['number', 'null'], minimum: 0, maximum: 31536000 },
      bodyAsOf: { type: ['string', 'null'], format: 'date-time' },
    },
  },
} as const;
