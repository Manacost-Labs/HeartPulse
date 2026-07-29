export const PUBLIC_API_OPENAPI = {
  openapi: '3.1.0',
  info: {
    title: 'Manacost Public API',
    version: '1.0.0',
    description: 'Versioned Hearthstone data API for approved applications.',
  },
  servers: [{ url: '/', description: 'Current Manacost environment' }],
  tags: [
    { name: 'Catalog', description: 'Available Manacost data resources.' },
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
    '/api/v1/catalog/manifest': {
      get: {
        summary: 'Get the public data catalog manifest',
        operationId: 'getCatalogManifest',
        tags: ['Catalog'],
        security: [{ ApiKeyAuth: [] }],
        responses: {
          '200': {
            description: 'Catalog manifest',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CatalogManifest' },
              },
            },
          },
          '401': { $ref: '#/components/responses/InvalidApiKey' },
          '403': { $ref: '#/components/responses/InsufficientScope' },
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
    },
    schemas: {
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
            items: { type: 'string', enum: ['catalog.read'] },
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
      InsufficientScope: {
        description: 'API key does not grant the required scope',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
    },
  },
} as const;
