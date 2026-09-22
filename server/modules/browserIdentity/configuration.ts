import type { DatabaseSync } from 'node:sqlite';
import type { IncomingMessage } from 'node:http';
import type { Configuration } from 'oidc-provider';

export interface ReaderIdentity {
  subject: string;
  displayName?: string;
}

export interface BrowserIdentityOptions {
  issuer: string;
  deployment: 'production' | 'staging' | 'test';
  allowStagingClient?: boolean;
  database: DatabaseSync;
  encryptionKey: Uint8Array;
  signingKeys: NonNullable<Configuration['jwks']>;
  cookieKeys: string[];
  clients: { id: string; secret: string; redirectUri: string }[];
  // Composition must implement authoritative block/epoch/grant checks, not a profile cache.
  resolveAccount(subject: string, grantId?: string): Promise<ReaderIdentity | undefined>;
  resolveBrowserAccount?(subject: string, request: IncomingMessage): Promise<ReaderIdentity | undefined>;
}

function secureUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search
    || value.includes('*') || url.href !== value) throw new Error('Identity URL must be exact HTTPS');
  return url;
}

export function validateIdentityOptions(options: BrowserIdentityOptions): void {
  const issuer = secureUrl(options.issuer);
  const production = options.deployment === 'production';
  if (options.allowStagingClient && !production) throw new Error('Staging bridge requires production identity');
  if (!['production', 'staging', 'test'].includes(options.deployment)
    || issuer.port || issuer.pathname !== '/identity'
    || (!production && issuer.hostname === 'hearthpulse.net')
    || production !== (options.issuer === 'https://hearthpulse.net/identity')) {
    throw new Error('Identity issuer does not match deployment');
  }
  if (!options.cookieKeys.length || options.cookieKeys.some((key) => key.length < 43)
    || !options.signingKeys.keys.length || options.encryptionKey.byteLength !== 32) {
    throw new Error('Explicit persistent identity keys required');
  }
  const ids = new Set<string>();
  if (!options.clients.length) throw new Error('At least one static identity client required');
  for (const client of options.clients) {
    const url = secureUrl(client.redirectUri);
    const productionCallback = ['hs-manacost.ru', 'hs-manacost.com'].includes(url.hostname);
    const stagingBridge = options.allowStagingClient === true && production
      && client.id === 'manacost-reader-staging'
      && client.redirectUri === 'https://test.hs-manacost.ru/reader-auth/callback';
    if (!client.id || ids.has(client.id) || client.secret.length < 43
      || url.pathname !== '/reader-auth/callback' || url.port || (production !== productionCallback && !stagingBridge)) {
      throw new Error('Invalid identity client or deployment mismatch');
    }
    ids.add(client.id);
  }
}
