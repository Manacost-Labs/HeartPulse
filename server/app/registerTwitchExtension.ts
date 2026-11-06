import type { DatabaseSync } from 'node:sqlite';
import { Router, type Application, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import type { ApplicationAuthManager } from '../modules/applicationAuth/public.js';
import {
  createTwitchAccountRouter,
  createTwitchApi,
  createTwitchApiRouter,
  createTwitchExtensionCors,
  createTwitchLinkPageRouter,
  createTwitchLinkRepository,
  createTwitchLiveState,
  readTwitchExtensionConfig,
} from '../modules/twitchExtension/public.js';

type Environment = Record<string, string | undefined>;

/**
 * Mounted on `/api/` before the site-wide CORS and API limiter: the extension
 * iframe has its own origin, and the app's state stream (about one request a
 * second) gets its own per-client budget instead of the 120-a-minute API one.
 */
export function createTwitchExtensionEdge(env: Environment): Router {
  const router = Router();
  router.use('/v1/twitch/ext', createTwitchExtensionCors(readTwitchExtensionConfig(env)));
  router.use('/v1/twitch/state', rateLimit({ windowMs: 60_000, max: 240, standardHeaders: true, legacyHeaders: false }));
  router.use('/account/twitch/connect', rateLimit({ windowMs: 10 * 60_000, max: 20, standardHeaders: true, legacyHeaders: false }));
  return router;
}

/** The global API limiter skips the state stream, which `createTwitchExtensionEdge` budgets itself. */
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
  setPrivateNoStore: (response: Response) => void;
  appUrl: string;
};

/** Returns the link rows for the account data export. */
export function registerTwitchExtension(dependencies: RegisterTwitchExtensionDependencies): {
  exportRows: (userId: string) => Iterable<string>;
} {
  const config = readTwitchExtensionConfig(dependencies.env);
  const links = createTwitchLinkRepository(dependencies.getDatabase);
  const live = createTwitchLiveState();
  const twitch = config ? createTwitchApi(config, (url, init) => fetch(url, init)) : null;
  // Only the operation and Twitch's status reach the log, never a token or a body.
  const onError = (scope: string, error: unknown) => console.warn(
    `[twitch-extension] ${scope} failed:`,
    error instanceof Error ? error.message : 'unknown error',
  );
  dependencies.app.use('/api/v1', createTwitchApiRouter({
    config: config,
    twitch,
    accessTokens: dependencies.accessTokens,
    links,
    live,
    linkUrl: `${dependencies.appUrl.replace(/\/$/, '')}/account/twitch`,
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
  dependencies.app.use(createTwitchLinkPageRouter());
  return { exportRows: userId => links.exportRows(userId) };
}
