const error = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/TwitchApiError' } } },
});

export const TWITCH_EXTENSION_OPENAPI_PATHS = {
  '/api/v1/twitch/state': {
    post: {
      summary: 'Relay the streamer\'s remaining deck to the Twitch extension',
      description: 'Validates the state, gzips it into an envelope of at most 5 KB and broadcasts it through Twitch Extension PubSub to the linked channel. At most one state per second per channel.',
      operationId: 'publishTwitchState',
      tags: ['Twitch'],
      security: [{ ApplicationBearer: ['tracker.write'] }],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/TwitchStreamState' } } },
      },
      responses: {
        '204': { description: 'Broadcast to the channel and kept as its snapshot' },
        '400': error('invalid_state: the body does not match the contract'),
        '401': { $ref: '#/components/responses/InvalidBearerToken' },
        '403': { $ref: '#/components/responses/InsufficientScope' },
        '404': error('twitch_not_linked: the account has no linked Twitch channel'),
        '413': error('payload_too_large: the body exceeds 16 KB or the compressed envelope exceeds 5 KB'),
        '429': {
          description: 'rate_limited: one state per second per channel',
          headers: { 'Retry-After': { schema: { type: 'integer', minimum: 1 } } },
        },
        '503': error('twitch_not_configured: the site has no extension credentials; twitch_unavailable: Twitch refused the broadcast'),
      },
    },
  },
  '/api/v1/twitch/status': {
    get: {
      summary: 'Whether the extension is configured and the account has a linked Twitch channel',
      operationId: 'getTwitchStatus',
      tags: ['Twitch'],
      security: [{ ApplicationBearer: ['profile.read'] }],
      responses: {
        '200': {
          description: 'Link state and the page where the streamer links Twitch',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/TwitchStatus' } } },
        },
        '401': { $ref: '#/components/responses/InvalidBearerToken' },
        '403': { $ref: '#/components/responses/InsufficientScope' },
      },
    },
  },
  '/api/v1/twitch/ext/snapshot': {
    get: {
      summary: 'The channel\'s last envelope for a viewer who opened the stream',
      description: 'Called by the extension iframe with the JWT from Twitch.ext.onAuthorized. CORS allows only https://<client id>.ext-twitch.tv.',
      operationId: 'getTwitchSnapshot',
      tags: ['Twitch'],
      security: [{ TwitchExtensionJwt: [] }],
      responses: {
        '200': {
          description: 'The last envelope, at most 30 minutes old',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/TwitchEnvelope' } } },
        },
        '204': { description: 'Nothing was sent for this channel in the last 30 minutes' },
        '401': error('invalid_extension_token'),
        '503': error('twitch_not_configured'),
      },
    },
  },
} as const;

export const TWITCH_EXTENSION_OPENAPI_SCHEMAS = {
  TwitchApiError: {
    type: 'object',
    required: ['error'],
    properties: {
      error: {
        type: 'object',
        required: ['code', 'message'],
        properties: { code: { type: 'string' }, message: { type: 'string' } },
      },
    },
  },
  TwitchStreamState: {
    type: 'object',
    required: ['v', 'seq', 'mode'],
    description: 'Fields outside this schema are dropped, never forwarded. With mode "none" there are no other fields.',
    properties: {
      v: { type: 'integer', const: 1 },
      seq: { type: 'integer', minimum: 0 },
      mode: { type: 'string', enum: ['constructed', 'none'] },
      deck: {
        type: 'object',
        required: ['name', 'hero', 'format', 'left', 'cards'],
        properties: {
          name: { type: ['string', 'null'], maxLength: 100 },
          hero: { type: ['string', 'null'], pattern: '^[A-Za-z0-9_]{1,64}$' },
          format: { type: 'string', enum: ['standard', 'wild', 'twist', 'classic', 'casual', 'other'] },
          left: { type: 'integer', minimum: 0, maximum: 100 },
          cards: {
            type: 'array',
            maxItems: 80,
            description: 'In the tracker\'s deck-list order (cost, name), never the in-game deck order.',
            items: {
              type: 'object',
              required: ['id', 'dbf', 'cost', 'name', 'left', 'total'],
              properties: {
                id: { type: 'string', pattern: '^[A-Za-z0-9_]{1,64}$' },
                dbf: { type: 'integer', minimum: 0 },
                cost: { type: 'integer', minimum: 0, maximum: 99 },
                name: { type: 'string', maxLength: 80 },
                left: { type: 'integer', minimum: 0, maximum: 30 },
                total: { type: 'integer', minimum: 0, maximum: 30 },
              },
            },
          },
        },
      },
      game: {
        type: 'object',
        required: ['turn'],
        properties: { turn: { type: 'integer', minimum: 0, maximum: 999 } },
      },
    },
  },
  TwitchStatus: {
    type: 'object',
    required: ['configured', 'linked', 'login', 'displayName', 'linkUrl'],
    properties: {
      configured: { type: 'boolean' },
      linked: { type: 'boolean' },
      login: { type: ['string', 'null'] },
      displayName: { type: ['string', 'null'] },
      linkUrl: { type: 'string', format: 'uri' },
    },
  },
  TwitchEnvelope: {
    type: 'object',
    required: ['v', 'seq', 'at', 'z'],
    properties: {
      v: { type: 'integer', const: 1 },
      seq: { type: 'integer', minimum: 0 },
      at: { type: 'integer', description: 'Site receive time in ms, for debugging only' },
      z: { type: 'string', contentEncoding: 'base64', description: 'gzip of the state JSON without v and seq' },
    },
  },
} as const;
