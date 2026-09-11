export const TRACKER_INGESTION_OPENAPI_PATHS = {
  '/api/v1/tracker/events/batch': {
    post: {
      summary: 'Store a bounded batch of IceCrow profile events',
      operationId: 'ingestTrackerEvents',
      tags: ['Tracker'],
      security: [{ ApplicationBearer: ['tracker.write'] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/TrackerEventBatch' },
          },
        },
      },
      responses: {
        '202': {
          description: 'Every valid event is acknowledged, including an already stored idempotency key',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/TrackerEventBatchResult' } } },
        },
        '400': { description: 'The batch envelope or an event id is invalid' },
        '401': { $ref: '#/components/responses/InvalidBearerToken' },
        '403': { $ref: '#/components/responses/InsufficientScope' },
        '413': { description: 'The JSON request exceeds 5 MiB' },
        '429': { description: 'Tracker ingestion rate limit reached' },
      },
    },
  },
} as const;

export const TRACKER_INGESTION_OPENAPI_SCHEMAS = {
  TrackerEventBatch: {
    type: 'object',
    additionalProperties: false,
    required: ['events'],
    properties: {
      events: {
        type: 'array',
        minItems: 1,
        maxItems: 50,
        items: { $ref: '#/components/schemas/TrackerEvent' },
      },
    },
  },
  TrackerEvent: {
    type: 'object',
    additionalProperties: false,
    required: ['eventId', 'type', 'schemaVersion', 'occurredAt', 'payload'],
    properties: {
      eventId: { type: 'string', format: 'uuid' },
      type: {
        type: 'string',
        enum: ['constructed_match', 'arena_match', 'arena_run', 'arena_draft_pick', 'battlegrounds_match', 'collection_snapshot'],
      },
      schemaVersion: { type: 'integer', const: 1 },
      occurredAt: { type: 'string', format: 'date-time' },
      payload: { type: 'object' },
    },
  },
  TrackerEventBatchResult: {
    type: 'object',
    additionalProperties: false,
    required: ['accepted', 'rejected'],
    properties: {
      accepted: { type: 'array', items: { type: 'string', format: 'uuid' } },
      rejected: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['eventId', 'code'],
          properties: {
            eventId: { type: 'string', format: 'uuid' },
            code: { type: 'string', enum: ['INVALID_EVENT', 'EVENT_LIMIT_EXCEEDED'] },
          },
        },
      },
    },
  },
} as const;
