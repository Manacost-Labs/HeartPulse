import type { DatabaseSync } from 'node:sqlite';
import type { Application, Request, Response } from 'express';
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
  type TwitchExtensionConfig,
  type TwitchLinkRepository,
} from '../modules/twitchExtension/public.js';

/**
 * Runs before the site-wide CORS and API limiter: the extension iframe has its
 * own origin, and the app's state stream (about one request a second) gets its
 * own per-client budget instead of the 120-a-minute API one.
 */
export function registerTwitchExtensionEdge(app: Application, config: TwitchExtensionConfig | null): void {
  app.use('/api/v1/twitch/ext', createTwitchExtensionCors(config));
  app.use('/api/v1/twitch/state', rateLimit({ windowMs: 60_000, max: 240, standardHeaders: true, legacyHeaders: false }));
  app.use('/api/account/twitch/connect', rateLimit({ windowMs: 10 * 60_000, max: 20, standardHeaders: true, legacyHeaders: false }));
}

/** The global API limiter skips the state stream, which `registerTwitchExtensionEdge` budgets itself. */
export const twitchStateStreamRequest = (method: string, apiPath: string) => (
  method === 'POST' && apiPath === '/v1/twitch/state'
);

type RegisterTwitchExtensionDependencies = {
  app: Application;
  getDatabase: () => DatabaseSync;
  config: TwitchExtensionConfig | null;
  accessTokens: Pick<ApplicationAuthManager, 'authenticate'>;
  userAuth: (request: Request) => { id: string } | null;
  setPrivateNoStore: (response: Response) => void;
  appUrl: string;
};

/** Returns the link repository so the account data export can include the link. */
export function registerTwitchExtension(dependencies: RegisterTwitchExtensionDependencies): TwitchLinkRepository {
  const links = createTwitchLinkRepository(dependencies.getDatabase);
  const live = createTwitchLiveState();
  const twitch = dependencies.config ? createTwitchApi(dependencies.config, (url, init) => fetch(url, init)) : null;
  // Only the operation and Twitch's status reach the log, never a token or a body.
  const onError = (scope: string, error: unknown) => console.warn(
    `[twitch-extension] ${scope} failed:`,
    error instanceof Error ? error.message : 'unknown error',
  );
  dependencies.app.use('/api/v1', createTwitchApiRouter({
    config: dependencies.config,
    twitch,
    accessTokens: dependencies.accessTokens,
    links,
    live,
    linkUrl: `${dependencies.appUrl.replace(/\/$/, '')}/account/twitch`,
    setPrivateNoStore: dependencies.setPrivateNoStore,
    onError,
  }));
  dependencies.app.use('/api', createTwitchAccountRouter({
    config: dependencies.config,
    twitch,
    links,
    live,
    userAuth: dependencies.userAuth,
    setPrivateNoStore: dependencies.setPrivateNoStore,
    secureCookies: dependencies.appUrl.startsWith('https://'),
    onError,
  }));
  dependencies.app.use(createTwitchLinkPageRouter());
  return links;
}
