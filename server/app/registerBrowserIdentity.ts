import type { Application } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { createBrowserIdentityRuntime, startIdentityCleanup } from '../modules/browserIdentity/public.js';
import { createReaderEntitlementsRouter } from '../modules/readerEntitlements/public.js';
import { assertReaderPermissionsClient, createReaderPermissionsRouter } from '../modules/readerPermissions/public.js';

/** Opt-in composition only: unset configuration must not change the existing login or public site. */
export function registerBrowserIdentity({ app, getDatabase, authCookieName, environment = process.env }: {
  app: Application; getDatabase: () => DatabaseSync; authCookieName: string; environment?: NodeJS.ProcessEnv;
}): { stop: () => void } | undefined {
  if (environment.BROWSER_IDENTITY_ENABLED !== '1') return;
  try {
    const deployment = environment.BROWSER_IDENTITY_DEPLOYMENT;
    if (deployment !== 'production' && deployment !== 'staging') throw new Error('Invalid environment');
    const clients = JSON.parse(environment.BROWSER_IDENTITY_CLIENTS ?? '[]');
    const runtime = createBrowserIdentityRuntime({
      issuer: environment.BROWSER_IDENTITY_ISSUER ?? '', deployment, database: getDatabase(), authCookieName,
      trustedProxy: environment.BROWSER_IDENTITY_TRUST_PROXY === '1',
      allowStagingClient: environment.BROWSER_IDENTITY_ALLOW_STAGING_CLIENT === '1',
      encryptionKey: Buffer.from(environment.BROWSER_IDENTITY_ENCRYPTION_KEY ?? '', 'base64url'),
      cookieKeys: JSON.parse(environment.BROWSER_IDENTITY_COOKIE_KEYS ?? '[]'),
      signingKeys: JSON.parse(environment.BROWSER_IDENTITY_JWKS ?? '{}'),
      clients,
    });
    if (environment.READER_ENTITLEMENTS_ENABLED === '1') {
      const configuredSources = (environment.READER_ENTITLEMENTS_PAID_SOURCES ?? 'boosty,patreon').split(',').map(value => value.trim());
      if (!configuredSources.length || configuredSources.some(value => value !== 'boosty' && value !== 'patreon')) {
        throw new Error('Invalid reader entitlement source allowlist');
      }
      app.use('/identity', createReaderEntitlementsRouter({
        database: getDatabase(),
        clients,
        allowedSources: configuredSources as Array<'boosty' | 'patreon'>,
      }));
    }
    if (environment.READER_PERMISSIONS_ENABLED === '1') {
      assertReaderPermissionsClient(clients);
      app.use('/identity', createReaderPermissionsRouter({
        database: getDatabase(),
        clients,
      }));
    }
    app.use('/identity', runtime.router);
    return startIdentityCleanup(getDatabase());
  } catch { throw new Error('Browser identity configuration invalid; no secret values are logged'); }
}
