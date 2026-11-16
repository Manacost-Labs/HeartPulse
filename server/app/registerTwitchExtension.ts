import type { DatabaseSync } from 'node:sqlite';
import type { Application, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import type { ApplicationAuthManager } from '../modules/applicationAuth/public.js';
import {
  createTwitchAccountRevoker,
  createTwitchAccountRouter,
  createTwitchApi,
  createTwitchApiRouter,
  createTwitchChannelRevoker,
  createTwitchExtensionCors,
  createTwitchLinkRepository,
  createTwitchLiveState,
  readTwitchExtensionConfig,
  TWITCH_ACCOUNT_PAGE,
  TWITCH_SNAPSHOT_SWEEP_MS,
  type TwitchFetch,
} from '../modules/twitchExtension/public.js';

type Environment = Record<string, string | undefined>;

/**
 * The site-wide CORS middleware answers every preflight itself with the site's
 * own origins; the extension iframe's preflight passes on to the extension's
 * CORS, mounted by `registerTwitchExtension`.
 */
export const twitchExtensionPreflight = (path: string) => path.startsWith('/api/v1/twitch/ext/');

/** The global API limiter skips the state stream: `registerTwitchExtension` budgets it per client. */
export const twitchStateStreamRequest = (method: string, apiPath: string) => (
  method === 'POST' && apiPath === '/v1/twitch/state'
);

type RegisterTwitchExtensionDependencies = {
  app: Application;
  getDatabase: () => DatabaseSync;
  /** `TWITCH_*` variables; without all of them the extension answers `twitch_not_configured`. */
  env: Environment;
  accessTokens: Pick<ApplicationAuthManager, 'authenticate'>;
  userAuth: (request: Request) => { id: string } | null;
  /** False for a blocked or missing site account: it neither publishes nor is shown. */
  accountActive: (userId: string) => boolean;
  setPrivateNoStore: (response: Response) => void;
  appUrl: string;
  /** Twitch's HTTP; the global `fetch` unless a test supplies its own. */
  twitchFetch?: TwitchFetch;
};

/**
 * The places that block or delete site accounts (the admin user route and the
 * account store in `server/index.ts`) take the account's channel away through
 * these two. They are module-level because those places are defined long
 * before the extension is registered; before that, and without a link, both
 * do nothing. A failure is logged and never reaches the caller: saving
 * accounts must not depend on the Twitch extension.
 */
let accounts: ReturnType<typeof createTwitchAccountRevoker> | null = null;
const guarded = (operation: string, work: () => void): void => {
  try {
    work();
  } catch (error) {
    console.warn(`[twitch-extension] ${operation} failed:`, error instanceof Error ? error.message : 'unknown error');
  }
};
/** The account has just been blocked. */
export const revokeTwitchAccount = (userId: string): void => guarded('revoke-account', () => accounts?.account(userId));
/** Every account but these is about to be deleted; call it before the delete, while the links still exist. */
export const revokeTwitchAccountsOutside = (keepUserIds: readonly string[]): void => (
  guarded('revoke-deleted-accounts', () => accounts?.accountsOutside(keepUserIds))
);

/** Returns the link rows for the account data export. */
export function registerTwitchExtension(dependencies: RegisterTwitchExtensionDependencies): {
  exportRows: (userId: string) => Iterable<string>;
} {
  const config = readTwitchExtensionConfig(dependencies.env);
  const links = createTwitchLinkRepository(dependencies.getDatabase);
  // The app's state stream is about one request a second: its own budget instead of the 120-a-minute API one.
  dependencies.app.use('/api/v1/twitch/ext', createTwitchExtensionCors(config));
  dependencies.app.use('/api/v1/twitch/state', rateLimit({ windowMs: 60_000, max: 240, standardHeaders: true, legacyHeaders: false }));
  dependencies.app.use('/api/account/twitch/connect', rateLimit({ windowMs: 10 * 60_000, max: 20, standardHeaders: true, legacyHeaders: false }));
  const live = createTwitchLiveState();
  // Expired snapshots leave memory on time, not only when a viewer asks; the timer never holds the process.
  setInterval(() => live.sweep(), TWITCH_SNAPSHOT_SWEEP_MS).unref();
  const twitch = config ? createTwitchApi(config, dependencies.twitchFetch ?? ((url, init) => fetch(url, init))) : null;
  // Only the operation and Twitch's status reach the log, never a token or a body.
  const onError = (scope: string, error: unknown) => console.warn(
    `[twitch-extension] ${scope} failed:`,
    error instanceof Error ? error.message : 'unknown error',
  );
  accounts = createTwitchAccountRevoker({ links, revoke: createTwitchChannelRevoker({ live, twitch, onError }) });
  dependencies.app.use('/api/v1', createTwitchApiRouter({
    config: config,
    twitch,
    accessTokens: dependencies.accessTokens,
    links,
    live,
    accountActive: dependencies.accountActive,
    // The account itself: the origin nginx serves listed documents only, and the account is `/?login`.
    linkUrl: `${dependencies.appUrl.replace(/\/$/, '')}${TWITCH_ACCOUNT_PAGE}`,
    setPrivateNoStore: dependencies.setPrivateNoStore,
    onError,
  }));
  dependencies.app.use('/api', createTwitchAccountRouter({
    config: config,
    twitch,
    links,
    live,
    userAuth: dependencies.userAuth,
    setPrivateNoStore: dependencies.setPrivateNoStore,
    secureCookies: dependencies.appUrl.startsWith('https://'),
    onError,
  }));
  return { exportRows: userId => links.exportRows(userId) };
}
