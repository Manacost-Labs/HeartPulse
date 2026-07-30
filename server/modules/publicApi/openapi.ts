export const PUBLIC_API_OPENAPI = {
  openapi: '3.1.0',
  info: {
    title: 'Manacost Public API',
    version: '1.2.0',
    description: 'Versioned Hearthstone data API for approved applications.',
  },
  servers: [{ url: '/', description: 'Current Manacost environment' }],
  tags: [
    { name: 'Authorization', description: 'OAuth 2.0 device authorization for the desktop tracker.' },
    { name: 'Profile', description: 'The authorized user and cached subscription status.' },
    { name: 'Catalog', description: 'Available Manacost data resources.' },
    { name: 'Images', description: 'Same-origin cached Hearthstone card images.' },
    { name: 'Statistics', description: 'Aggregated constructed-card statistics and history.' },
    { name: 'Administration', description: 'Administrator-only API key lifecycle.' },
  ],
  paths: {
    '/api/v1/openapi.json': {
      get: {
        summary: 'Get the OpenAPI contract',
        operationId: 'getPublicApiOpenApi',
        responses: { '200': { description: 'OpenAPI 3.1 document' } },
      },
    },
    '/api/v1/oauth/device/code': {
      post: {
        summary: 'Start desktop application authorization',
        description: 'Starts the OAuth 2.0 Device Authorization Grant for the registered public client.',
        operationId: 'startDeviceAuthorization',
        tags: ['Authorization'],
        requestBody: {
          required: true,
          content: {
            'application/x-www-form-urlencoded': {
              schema: { $ref: '#/components/schemas/DeviceAuthorizationInput' },
            },
          },
        },
        responses: {
          '200': {
            description: 'A short-lived device authorization was created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DeviceAuthorization' },
              },
            },
          },
          '400': { description: 'Unknown client or unsupported scope' },
          '429': { description: 'Too many authorization attempts' },
          '503': { description: 'Authorization service is temporarily unavailable' },
        },
      },
    },
    '/api/v1/oauth/device/authorization': {
      get: {
        summary: 'Inspect a device authorization in the browser',
        operationId: 'inspectDeviceAuthorization',
        tags: ['Authorization'],
        parameters: [{
          name: 'user_code',
          in: 'query',
          required: true,
          schema: { type: 'string', pattern: '^[A-Z2-9]{4}-[A-Z2-9]{4}$' },
        }],
        responses: {
          '200': { description: 'Pending authorization details' },
          '401': { description: 'A signed-in browser session is required' },
          '404': { description: 'Authorization is invalid, completed or expired' },
        },
      },
    },
    '/api/v1/oauth/device/approve': {
      post: {
        summary: 'Approve or deny a device authorization',
        description: 'Requires an authenticated same-origin browser session and CSRF header.',
        operationId: 'decideDeviceAuthorization',
        tags: ['Authorization'],
        parameters: [{
          name: 'X-CSRF-Request',
          in: 'header',
          required: true,
          schema: { type: 'string', const: '1' },
        }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/DeviceAuthorizationDecision' },
            },
          },
        },
        responses: {
          '200': { description: 'The decision was recorded' },
          '400': { description: 'Authorization is invalid, completed or expired' },
          '401': { description: 'A signed-in browser session is required' },
          '403': { description: 'CSRF validation failed' },
        },
      },
    },
    '/api/v1/oauth/token': {
      post: {
        summary: 'Exchange a device code or rotate a refresh token',
        operationId: 'exchangeApplicationToken',
        tags: ['Authorization'],
        requestBody: {
          required: true,
          content: {
            'application/x-www-form-urlencoded': {
              schema: { $ref: '#/components/schemas/ApplicationTokenInput' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Short-lived bearer token and rotating refresh token',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApplicationTokenPair' },
              },
            },
          },
          '400': { description: 'OAuth token error such as authorization_pending or invalid_grant' },
          '429': { description: 'Polling or refresh rate limit reached' },
        },
      },
    },
    '/api/v1/oauth/revoke': {
      post: {
        summary: 'Revoke a refresh-token family',
        operationId: 'revokeApplicationToken',
        tags: ['Authorization'],
        requestBody: {
          required: true,
          content: {
            'application/x-www-form-urlencoded': {
              schema: {
                type: 'object',
                required: ['token'],
                properties: { token: { type: 'string', writeOnly: true } },
              },
            },
          },
        },
        responses: { '200': { description: 'Revocation is idempotent' } },
      },
    },
    '/api/v1/me': {
      get: {
        summary: 'Get the authorized user and subscription status',
        operationId: 'getApplicationProfile',
        tags: ['Profile'],
        security: [{ ApplicationBearer: [] }],
        responses: {
          '200': {
            description: 'Minimal user profile and cached subscription status',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApplicationProfile' },
              },
            },
          },
          '401': { $ref: '#/components/responses/InvalidBearerToken' },
          '403': { $ref: '#/components/responses/InsufficientScope' },
        },
      },
    },
    '/api/v1/catalog/manifest': {
      get: {
        summary: 'Get the public data catalog manifest',
        operationId: 'getCatalogManifest',
        tags: ['Catalog'],
        security: [{ ApiKeyAuth: [] }, { ApplicationBearer: [] }],
        responses: {
          '200': {
            description: 'Catalog manifest',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CatalogManifest' },
              },
            },
          },
          '401': { $ref: '#/components/responses/InvalidCredential' },
          '403': { $ref: '#/components/responses/InsufficientScope' },
        },
      },
    },
    '/api/v1/cards': {
      get: {
        summary: 'List Hearthstone cards',
        description: 'Returns an allowlisted view of the verified Standard or Wild catalog with stable cursor pagination.',
        operationId: 'listCards',
        tags: ['Catalog'],
        security: [{ ApiKeyAuth: [] }, { ApplicationBearer: [] }],
        parameters: [
          {
            name: 'format',
            in: 'query',
            required: false,
            description: 'Defaults to standard.',
            schema: { type: 'string', enum: ['standard', 'wild'], default: 'standard' },
          },
          {
            name: 'query',
            in: 'query',
            required: false,
            schema: { type: 'string', maxLength: 120 },
          },
          ...['class', 'set', 'type', 'rarity', 'mechanic'].map(name => ({
            name,
            in: 'query' as const,
            required: false,
            schema: { type: 'string' as const, pattern: '^[A-Za-z0-9_]{1,80}$' },
          })),
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 120, default: 60 },
          },
          {
            name: 'cursor',
            in: 'query',
            required: false,
            schema: { type: 'string', minLength: 4, maxLength: 128 },
          },
          {
            name: 'If-None-Match',
            in: 'header',
            required: false,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'A deterministic page of cards',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CardListResponse' },
              },
            },
          },
          '304': { description: 'The representation has not changed' },
          '400': { description: 'Invalid filter, format, limit or cursor' },
          '401': { $ref: '#/components/responses/InvalidCredential' },
          '403': { $ref: '#/components/responses/InsufficientScope' },
          '503': { description: 'No verified catalog is currently available' },
        },
      },
    },
    '/api/v1/cards/{cardId}': {
      get: {
        summary: 'Get one Hearthstone card',
        description: 'Returns the stable card schema plus related tokens and generated-card pools. Format defaults to wild.',
        operationId: 'getCard',
        tags: ['Catalog'],
        security: [{ ApiKeyAuth: [] }, { ApplicationBearer: [] }],
        parameters: [
          {
            name: 'cardId',
            in: 'path',
            required: true,
            schema: { type: 'string', pattern: '^[A-Za-z0-9_]{2,80}$' },
          },
          {
            name: 'format',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['standard', 'wild'], default: 'wild' },
          },
          {
            name: 'If-None-Match',
            in: 'header',
            required: false,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Card details and related cards',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CardDetailResponse' },
              },
            },
          },
          '304': { description: 'The representation has not changed' },
          '400': { description: 'Invalid card id or format' },
          '401': { $ref: '#/components/responses/InvalidCredential' },
          '403': { $ref: '#/components/responses/InsufficientScope' },
          '404': { description: 'The card does not exist in the selected catalog' },
          '503': { description: 'Card details cannot be resolved authoritatively' },
        },
      },
    },
    '/api/v1/card-statistics': {
      get: {
        summary: 'List the complete card-statistics snapshot',
        description: 'Returns a deterministic page for one format, rank and period. Requires statistics.read.',
        operationId: 'listCardStatistics',
        tags: ['Statistics'],
        security: [{ ApiKeyAuth: [] }, { ApplicationBearer: [] }],
        parameters: [
          {
            name: 'format',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['standard', 'wild'], default: 'standard' },
          },
          {
            name: 'rank',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: ['legend', 'diamond_4_1', 'diamond', 'platinum'],
              default: 'legend',
            },
          },
          {
            name: 'period',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: ['1d', '3d', '7d', '14d', 'patch'],
              default: '1d',
            },
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 500, default: 120 },
          },
          {
            name: 'cursor',
            in: 'query',
            required: false,
            schema: { type: 'string', minLength: 8, maxLength: 240 },
          },
          {
            name: 'If-None-Match',
            in: 'header',
            required: false,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'One page of the selected aggregate statistics snapshot',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CardStatisticsListResponse' },
              },
            },
          },
          '304': { description: 'The representation has not changed' },
          '400': { description: 'Invalid format, rank, period, limit or cursor' },
          '401': { $ref: '#/components/responses/InvalidCredential' },
          '403': { $ref: '#/components/responses/InsufficientScope' },
          '503': { description: 'No authoritative or last-known-good statistics are available' },
        },
      },
    },
    '/api/v1/cards/{cardId}/statistics': {
      get: {
        summary: 'Get current statistics for one card',
        description: 'Returns nullable aggregate metrics for one format, rank and period. Requires statistics.read.',
        operationId: 'getCardStatistics',
        tags: ['Statistics'],
        security: [{ ApiKeyAuth: [] }, { ApplicationBearer: [] }],
        parameters: [
          {
            name: 'cardId',
            in: 'path',
            required: true,
            schema: { type: 'string', pattern: '^[A-Za-z0-9_]{2,80}$' },
          },
          {
            name: 'format',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['standard', 'wild'], default: 'standard' },
          },
          {
            name: 'rank',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: ['legend', 'diamond_4_1', 'diamond', 'platinum'],
              default: 'legend',
            },
          },
          {
            name: 'period',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: ['1d', '3d', '7d', '14d', 'patch'],
              default: '1d',
            },
          },
          {
            name: 'If-None-Match',
            in: 'header',
            required: false,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Current aggregate metrics for the card',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CardStatisticsDetailResponse' },
              },
            },
          },
          '304': { description: 'The representation has not changed' },
          '400': { description: 'Invalid card id, format, rank or period' },
          '401': { $ref: '#/components/responses/InvalidCredential' },
          '403': { $ref: '#/components/responses/InsufficientScope' },
          '404': { description: 'Card is not in the selected catalog' },
          '503': { description: 'Card statistics are temporarily unavailable' },
        },
      },
    },
    '/api/v1/cards/{cardId}/statistics/history': {
      get: {
        summary: 'Get card-statistics history',
        description: 'Returns up to 1,000 chronological aggregate points. Requires statistics.read.',
        operationId: 'getCardStatisticsHistory',
        tags: ['Statistics'],
        security: [{ ApiKeyAuth: [] }, { ApplicationBearer: [] }],
        parameters: [
          {
            name: 'cardId',
            in: 'path',
            required: true,
            schema: { type: 'string', pattern: '^[A-Za-z0-9_]{2,80}$' },
          },
          {
            name: 'format',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['standard', 'wild'], default: 'standard' },
          },
          {
            name: 'rank',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: ['legend', 'diamond_4_1', 'diamond', 'platinum'],
              default: 'legend',
            },
          },
          {
            name: 'period',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: ['1d', '3d', '7d', '14d', 'patch'],
              default: '1d',
            },
          },
          {
            name: 'days',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 7, maximum: 365, default: 90 },
          },
          {
            name: 'If-None-Match',
            in: 'header',
            required: false,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Chronological card-statistics points',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CardStatisticsHistoryResponse' },
              },
            },
          },
          '304': { description: 'The representation has not changed' },
          '400': { description: 'Invalid card id, slice dimension or day range' },
          '401': { $ref: '#/components/responses/InvalidCredential' },
          '403': { $ref: '#/components/responses/InsufficientScope' },
          '404': { description: 'Card is not in the selected catalog' },
          '503': { description: 'Card statistics are temporarily unavailable' },
        },
      },
    },
    '/api/v1/cards/{cardId}/images/{variant}.webp': {
      get: {
        summary: 'Get a cached card image',
        description: 'Returns a same-origin WebP image from the Blizzard-first local cache.',
        operationId: 'getCardImage',
        tags: ['Images'],
        security: [{ ApiKeyAuth: [] }, { ApplicationBearer: [] }],
        parameters: [
          {
            name: 'cardId',
            in: 'path',
            required: true,
            schema: { type: 'string', pattern: '^[A-Za-z0-9_]+$', maxLength: 80 },
          },
          {
            name: 'variant',
            in: 'path',
            required: true,
            schema: { type: 'string', enum: ['thumb', 'full', 'tile'] },
          },
          {
            name: 'If-None-Match',
            in: 'header',
            required: false,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'WebP card image',
            headers: {
              ETag: { schema: { type: 'string' } },
              'X-Card-Image-Source': {
                schema: { type: 'string', enum: ['blizzard', 'fallback', 'placeholder'] },
              },
            },
            content: {
              'image/webp': {
                schema: { type: 'string', contentEncoding: 'binary' },
              },
            },
          },
          '304': { description: 'The cached representation has not changed' },
          '400': { description: 'Invalid card id or image variant' },
          '401': { $ref: '#/components/responses/InvalidCredential' },
          '403': { $ref: '#/components/responses/InsufficientScope' },
          '502': { description: 'Card image could not be resolved or streamed' },
          '503': { description: 'Card image service is not configured' },
        },
      },
    },
    '/api/admin/api-keys': {
      get: {
        summary: 'List API key metadata',
        tags: ['Administration'],
        responses: {
          '200': { description: 'Secret-free API key metadata' },
          '403': { description: 'Administrator access required' },
        },
      },
      post: {
        summary: 'Create an API key',
        description: 'The raw apiKey is returned once and cannot be recovered.',
        tags: ['Administration'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateApiKeyInput' },
            },
          },
        },
        responses: {
          '201': { description: 'API key created; raw secret included once' },
          '400': { description: 'Invalid name or scope' },
          '403': { description: 'Administrator access required' },
        },
      },
    },
    '/api/admin/api-keys/{id}': {
      delete: {
        summary: 'Revoke an API key',
        tags: ['Administration'],
        parameters: [{
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string' },
        }],
        responses: {
          '204': { description: 'Key is revoked or already absent' },
          '403': { description: 'Administrator access required' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
      ApplicationBearer: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'opaque',
        description: 'Short-lived access token issued by the device authorization flow.',
      },
    },
    schemas: {
      DeviceAuthorizationInput: {
        type: 'object',
        additionalProperties: false,
        required: ['client_id'],
        properties: {
          client_id: { type: 'string', const: 'manacost-tracker' },
          scope: {
            type: 'string',
            example: 'profile.read subscription.read catalog.read images.read statistics.read',
          },
        },
      },
      DeviceAuthorization: {
        type: 'object',
        required: [
          'device_code',
          'user_code',
          'verification_uri',
          'verification_uri_complete',
          'expires_in',
          'interval',
        ],
        properties: {
          device_code: { type: 'string', writeOnly: true },
          user_code: { type: 'string', pattern: '^[A-Z2-9]{4}-[A-Z2-9]{4}$' },
          verification_uri: { type: 'string', format: 'uri' },
          verification_uri_complete: { type: 'string', format: 'uri' },
          expires_in: { type: 'integer', const: 600 },
          interval: { type: 'integer', minimum: 5 },
        },
      },
      DeviceAuthorizationDecision: {
        type: 'object',
        additionalProperties: false,
        required: ['user_code', 'decision'],
        properties: {
          user_code: { type: 'string', pattern: '^[A-Z2-9]{4}-[A-Z2-9]{4}$' },
          decision: { type: 'string', enum: ['approve', 'deny'] },
        },
      },
      ApplicationTokenInput: {
        type: 'object',
        required: ['grant_type', 'client_id'],
        properties: {
          grant_type: {
            type: 'string',
            enum: ['urn:ietf:params:oauth:grant-type:device_code', 'refresh_token'],
          },
          client_id: { type: 'string', const: 'manacost-tracker' },
          device_code: { type: 'string', writeOnly: true },
          refresh_token: { type: 'string', writeOnly: true },
        },
      },
      ApplicationTokenPair: {
        type: 'object',
        required: ['access_token', 'refresh_token', 'token_type', 'expires_in', 'scope'],
        properties: {
          access_token: { type: 'string', writeOnly: true },
          refresh_token: { type: 'string', writeOnly: true },
          token_type: { type: 'string', const: 'Bearer' },
          expires_in: { type: 'integer', const: 900 },
          scope: { type: 'string' },
        },
      },
      ApplicationProfile: {
        type: 'object',
        additionalProperties: false,
        required: ['user', 'subscription'],
        properties: {
          user: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'publicProfileId', 'profileUrl', 'email', 'name', 'avatarInitials'],
            properties: {
              id: { type: 'string' },
              publicProfileId: { type: 'string' },
              profileUrl: { type: 'string' },
              email: { type: 'string', format: 'email' },
              name: { type: 'string' },
              avatarInitials: { type: 'string' },
            },
          },
          subscription: {
            type: 'object',
            additionalProperties: false,
            description: 'Normalized cached status without provider-specific records.',
            required: ['hasAccess', 'source', 'checkedAt', 'stale', 'entitlements'],
            properties: {
              hasAccess: { type: 'boolean' },
              source: { type: 'string' },
              checkedAt: { type: ['string', 'null'], format: 'date-time' },
              stale: { type: 'boolean' },
              entitlements: {
                type: 'object',
                additionalProperties: { type: 'boolean' },
              },
            },
          },
        },
      },
      CreateApiKeyInput: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'scopes'],
        properties: {
          name: { type: 'string', minLength: 3, maxLength: 80 },
          scopes: {
            type: 'array',
            minItems: 1,
            uniqueItems: true,
            items: {
              type: 'string',
              enum: ['catalog.read', 'images.read', 'statistics.read'],
            },
          },
        },
      },
      CatalogManifest: {
        type: 'object',
        required: ['apiVersion', 'schemaVersion', 'generatedAt', 'resources'],
        properties: {
          apiVersion: { type: 'string', const: 'v1' },
          schemaVersion: { type: 'string' },
          generatedAt: { type: 'string', format: 'date-time' },
          resources: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'href', 'status'],
              properties: {
                id: { type: 'string' },
                href: { type: 'string' },
                status: { type: 'string', enum: ['AVAILABLE'] },
              },
            },
          },
        },
      },
      LocalizedCardText: {
        type: 'object',
        additionalProperties: false,
        required: ['ru', 'en'],
        properties: {
          ru: { type: ['string', 'null'] },
          en: { type: ['string', 'null'] },
        },
      },
      CardImages: {
        type: 'object',
        additionalProperties: false,
        required: ['thumb', 'full', 'tile'],
        properties: {
          thumb: { type: 'string', pattern: '^/api/v1/cards/.+/images/thumb\\.webp$' },
          full: { type: 'string', pattern: '^/api/v1/cards/.+/images/full\\.webp$' },
          tile: { type: 'string', pattern: '^/api/v1/cards/.+/images/tile\\.webp$' },
        },
      },
      CardSummary: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id', 'dbfId', 'slug', 'collectible', 'formats', 'name', 'text',
          'flavor', 'set', 'type', 'rarity', 'cardClass', 'multiClass',
          'minionType', 'minionTypes', 'spellSchool', 'cost', 'attack',
          'health', 'durability', 'armor', 'artist', 'mechanics',
          'referencedTags', 'keywordIds', 'releasedAt', 'images',
        ],
        properties: {
          id: { type: 'string', pattern: '^[A-Za-z0-9_]{2,80}$' },
          dbfId: { type: ['integer', 'null'], minimum: 0 },
          slug: { type: ['string', 'null'] },
          collectible: { type: 'boolean' },
          formats: {
            type: 'array',
            uniqueItems: true,
            items: { type: 'string', enum: ['standard', 'wild'] },
          },
          name: { $ref: '#/components/schemas/LocalizedCardText' },
          text: {
            allOf: [{ $ref: '#/components/schemas/LocalizedCardText' }],
            description: 'Text may contain only b, i and br markup.',
          },
          flavor: { $ref: '#/components/schemas/LocalizedCardText' },
          set: { type: ['string', 'null'] },
          type: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'nameRu'],
            properties: {
              id: { type: ['string', 'null'] },
              nameRu: { type: ['string', 'null'] },
            },
          },
          rarity: { type: ['string', 'null'] },
          cardClass: { type: ['string', 'null'] },
          multiClass: { type: 'array', items: { type: 'string' } },
          minionType: { type: ['string', 'null'] },
          minionTypes: { type: 'array', items: { type: 'string' } },
          spellSchool: { type: ['string', 'null'] },
          cost: { type: ['integer', 'null'], minimum: 0 },
          attack: { type: ['integer', 'null'], minimum: 0 },
          health: { type: ['integer', 'null'], minimum: 0 },
          durability: { type: ['integer', 'null'], minimum: 0 },
          armor: { type: ['integer', 'null'], minimum: 0 },
          artist: { type: ['string', 'null'] },
          mechanics: { type: 'array', items: { type: 'string' } },
          referencedTags: { type: 'array', items: { type: 'string' } },
          keywordIds: { type: 'array', items: { type: 'integer', minimum: 1 } },
          releasedAt: { type: ['string', 'null'], format: 'date-time' },
          images: { $ref: '#/components/schemas/CardImages' },
        },
      },
      RelatedCard: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'name', 'images'],
        properties: {
          id: { type: ['string', 'null'] },
          name: { $ref: '#/components/schemas/LocalizedCardText' },
          images: {
            oneOf: [
              { $ref: '#/components/schemas/CardImages' },
              { type: 'null' },
            ],
          },
        },
      },
      CardListResponse: {
        type: 'object',
        additionalProperties: false,
        required: ['data', 'pagination', 'meta'],
        properties: {
          data: { type: 'array', items: { $ref: '#/components/schemas/CardSummary' } },
          pagination: {
            type: 'object',
            additionalProperties: false,
            required: ['limit', 'total', 'hasMore', 'nextCursor'],
            properties: {
              limit: { type: 'integer', minimum: 1, maximum: 120 },
              total: { type: 'integer', minimum: 0 },
              hasMore: { type: 'boolean' },
              nextCursor: { type: ['string', 'null'] },
            },
          },
          meta: {
            type: 'object',
            additionalProperties: false,
            required: ['format', 'datasetVersion', 'dataStatus', 'publishedAt'],
            properties: {
              format: { type: 'string', enum: ['standard', 'wild'] },
              datasetVersion: { type: 'string' },
              dataStatus: { type: 'string', enum: ['fresh', 'stale'] },
              publishedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
      CardDetailResponse: {
        type: 'object',
        additionalProperties: false,
        required: ['data', 'meta'],
        properties: {
          data: {
            allOf: [
              { $ref: '#/components/schemas/CardSummary' },
              {
                type: 'object',
                required: ['relatedCards', 'generatedCardPools'],
                properties: {
                  relatedCards: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['heading', 'cards'],
                      properties: {
                        heading: { type: ['string', 'null'] },
                        cards: { type: 'array', items: { $ref: '#/components/schemas/RelatedCard' } },
                      },
                    },
                  },
                  generatedCardPools: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['name', 'cards'],
                      properties: {
                        name: { type: ['string', 'null'] },
                        cards: { type: 'array', items: { $ref: '#/components/schemas/RelatedCard' } },
                      },
                    },
                  },
                },
              },
            ],
          },
          meta: {
            type: 'object',
            additionalProperties: false,
            required: ['format', 'datasetVersion', 'dataStatus', 'partial', 'warning'],
            properties: {
              format: { type: 'string', enum: ['standard', 'wild'] },
              datasetVersion: { type: 'string' },
              dataStatus: { type: 'string', enum: ['fresh', 'stale'] },
              partial: { type: 'boolean' },
              warning: { type: ['string', 'null'] },
            },
          },
        },
      },
      CardStatisticsMetrics: {
        type: 'object',
        additionalProperties: false,
        required: [
          'deckPopularityPercent', 'deckWinratePercent', 'averageCopies',
          'timesPlayed', 'winrateWhenPlayedPercent', 'winrateWhenDrawnPercent',
          'keepPercentage', 'openingHandWinratePercent', 'averageTurnsInHand',
          'averageTurnPlayed',
        ],
        properties: {
          deckPopularityPercent: {
            type: ['number', 'null'],
            minimum: 0,
            maximum: 100,
            description: 'Share of decks containing the card, in percentage points.',
          },
          deckWinratePercent: {
            type: ['number', 'null'],
            minimum: 0,
            maximum: 100,
            description: 'Win rate of decks containing the card, in percentage points.',
          },
          averageCopies: {
            type: ['number', 'null'],
            minimum: 0,
            description: 'Mean copies per deck.',
          },
          timesPlayed: {
            type: ['integer', 'null'],
            minimum: 0,
            description: 'Observed plays/sample count.',
          },
          winrateWhenPlayedPercent: {
            type: ['number', 'null'],
            minimum: 0,
            maximum: 100,
            description: 'Win rate when the card was played, in percentage points.',
          },
          winrateWhenDrawnPercent: {
            type: ['number', 'null'],
            minimum: 0,
            maximum: 100,
            description: 'Win rate when the card was drawn, in percentage points.',
          },
          keepPercentage: {
            type: ['number', 'null'],
            minimum: 0,
            maximum: 100,
            description: 'Mulligan keep rate, in percentage points.',
          },
          openingHandWinratePercent: {
            type: ['number', 'null'],
            minimum: 0,
            maximum: 100,
            description: 'Win rate when in the opening hand, in percentage points.',
          },
          averageTurnsInHand: {
            type: ['number', 'null'],
            minimum: 0,
            description: 'Mean number of turns held before play.',
          },
          averageTurnPlayed: {
            type: ['number', 'null'],
            minimum: 0,
            description: 'Mean turn number on which the card was played.',
          },
        },
      },
      CardStatisticsItem: {
        type: 'object',
        additionalProperties: false,
        required: ['cardId', 'metrics'],
        properties: {
          cardId: { type: 'string', pattern: '^[A-Za-z0-9_]{2,80}$' },
          metrics: { $ref: '#/components/schemas/CardStatisticsMetrics' },
        },
      },
      CardStatisticsMetaFields: {
        type: 'object',
        required: [
          'format', 'period', 'rank', 'updatedAt', 'datasetVersion', 'dataStatus',
        ],
        properties: {
          format: { type: 'string', enum: ['standard', 'wild'] },
          period: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'timeRange', 'patch'],
            properties: {
              id: { type: 'string', enum: ['1d', '3d', '7d', '14d', 'patch'] },
              timeRange: { type: ['string', 'null'] },
              patch: { type: ['string', 'null'] },
            },
          },
          rank: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'rankRange'],
            properties: {
              id: {
                type: 'string',
                enum: ['legend', 'diamond_4_1', 'diamond', 'platinum'],
              },
              rankRange: { type: 'string' },
            },
          },
          updatedAt: { type: ['string', 'null'], format: 'date-time' },
          datasetVersion: { type: 'string' },
          dataStatus: { type: 'string', enum: ['fresh', 'stale'] },
        },
      },
      CardStatisticsMeta: {
        allOf: [{ $ref: '#/components/schemas/CardStatisticsMetaFields' }],
        unevaluatedProperties: false,
      },
      CardStatisticsListResponse: {
        type: 'object',
        additionalProperties: false,
        required: ['data', 'pagination', 'meta'],
        properties: {
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/CardStatisticsItem' },
          },
          pagination: {
            type: 'object',
            additionalProperties: false,
            required: ['limit', 'total', 'hasMore', 'nextCursor'],
            properties: {
              limit: { type: 'integer', minimum: 1, maximum: 500 },
              total: { type: 'integer', minimum: 0 },
              hasMore: { type: 'boolean' },
              nextCursor: { type: ['string', 'null'] },
            },
          },
          meta: { $ref: '#/components/schemas/CardStatisticsMeta' },
        },
      },
      CardStatisticsDetailResponse: {
        type: 'object',
        additionalProperties: false,
        required: ['data', 'meta'],
        properties: {
          data: { $ref: '#/components/schemas/CardStatisticsItem' },
          meta: { $ref: '#/components/schemas/CardStatisticsMeta' },
        },
      },
      CardStatisticsHistoryPoint: {
        type: 'object',
        additionalProperties: false,
        required: ['recordedAt', 'metrics'],
        properties: {
          recordedAt: { type: 'string', format: 'date-time' },
          metrics: { $ref: '#/components/schemas/CardStatisticsMetrics' },
        },
      },
      CardStatisticsHistoryResponse: {
        type: 'object',
        additionalProperties: false,
        required: ['data', 'meta'],
        properties: {
          data: {
            type: 'array',
            maxItems: 1000,
            items: { $ref: '#/components/schemas/CardStatisticsHistoryPoint' },
          },
          meta: {
            allOf: [
              { $ref: '#/components/schemas/CardStatisticsMetaFields' },
              {
                type: 'object',
                required: ['days'],
                properties: {
                  days: { type: 'integer', minimum: 7, maximum: 365 },
                },
              },
            ],
            unevaluatedProperties: false,
          },
        },
      },
      Error: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    responses: {
      InvalidApiKey: {
        description: 'API key is missing, unknown or revoked',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      InvalidCredential: {
        description: 'API key or application bearer token is missing, invalid, revoked or expired',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      InsufficientScope: {
        description: 'The credential does not grant the required scope',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      InvalidBearerToken: {
        description: 'Bearer token is missing, unknown, revoked or expired',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
    },
  },
} as const;
