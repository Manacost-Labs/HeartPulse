export const PUBLIC_API_OPENAPI = {
  openapi: '3.1.0',
  info: {
    title: 'Manacost Public API',
    version: '1.0.0',
    description: 'Versioned Hearthstone data API for approved applications.',
  },
  servers: [{ url: '/', description: 'Current Manacost environment' }],
  tags: [
    { name: 'Authorization', description: 'OAuth 2.0 device authorization for the desktop tracker.' },
    { name: 'Profile', description: 'The authorized user and cached subscription status.' },
    { name: 'Catalog', description: 'Available Manacost data resources.' },
    { name: 'Images', description: 'Same-origin cached Hearthstone card images.' },
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
            example: 'profile.read subscription.read catalog.read images.read',
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
            items: { type: 'string', enum: ['catalog.read', 'images.read'] },
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
