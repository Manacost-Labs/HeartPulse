import { gunzipSync } from 'node:zlib';
import { Router, type Request, type Response } from 'express';
import type { ApplicationAuthManager } from '../applicationAuth/public.js';
import type { ReplayShareRepository } from './repository.js';
import { sanitizeReplayUpload } from './sanitize.js';

type ReplayShareRouterDependencies = {
  accessTokens: Pick<ApplicationAuthManager, 'authenticate'>;
  repository: ReplayShareRepository;
  /** Lower-case archetype names the site knows: the only opponent archetypes a replay may carry. */
  knownArchetypes: ReadonlySet<string>;
  setPrivateNoStore: (response: Response) => void;
  /** The site session (account page): its replays and deleting them. */
  userAuth: (request: Request) => { id: string } | null;
  /** Public address of the site, for the replay link. */
  publicOrigin: string;
  /** Card ids → Russian names, so the page shows cards only by known names. */
  resolveCardNames?: (cardIds: string[]) => Promise<Record<string, string>>;
  now?: () => number;
};

const apiError = (code: string, message: string) => ({ error: { code, message } });
/** Unpacked replays kept for the public read: a shared link is opened by many at once. */
const READ_CACHE_SIZE = 32;
const REPLAY_ID = /^[0-9A-Za-z]{10}$/;
/** The game's tracker event id (a UUID, plan 2.3): links the replay in the profile's game list; never published. */
const GAME_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** Tokens that look like card ids (a letter, then letters, digits and at least one underscore). */
const CARD_ID = /\b[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]{1,60}\b/g;

function bearerToken(authorization: unknown): string {
  const value = String(authorization ?? '').trim();
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : '';
}

/**
 * Web replays (plan 2.2): the desktop app uploads a sanitized `.hpr` on the player's explicit "Upload to the site",
 * anyone with the link reads it, the uploader deletes it by the link's token or from the account page. Replays older
 * than the retention are pruned on each upload and once a day (composition calls `prune`).
 */
export function createReplayShareRouter(dependencies: ReplayShareRouterDependencies): Router & { prune: () => void } {
  const router = Router();
  const now = dependencies.now ?? Date.now;
  // The public answer by id (file and card names), newest last; a delete or the prune drops it at once.
  const readCache = new Map<string, { kind: string; createdAt: string; header: Record<string, unknown>; text: string; cardNames: Record<string, string> }>();
  const forget = (id: string) => readCache.delete(id);
  const prune = (at: number) => {
    if (dependencies.repository.prune(at) > 0) readCache.clear();
  };

  router.post('/v1/tracker/replays', (request, response) => {
    dependencies.setPrivateNoStore(response);
    const authenticated = dependencies.accessTokens.authenticate(bearerToken(request.headers.authorization), ['tracker.write']);
    if (!authenticated) {
      response.set('WWW-Authenticate', 'Bearer realm="HearthPulse Tracker"');
      return response.status(401).json(apiError('INVALID_ACCESS_TOKEN', 'Access token is invalid or expired'));
    }
    if (authenticated === 'FORBIDDEN') {
      return response.status(403).json(apiError('INSUFFICIENT_SCOPE', 'Access token does not grant tracker.write'));
    }
    const encoded = request.body?.hpr;
    const gameId = request.body?.gameId ?? null;
    if (request.body?.v !== 1 || typeof encoded !== 'string' || encoded.length > 1_000_000 || !/^[A-Za-z0-9+/=]+$/.test(encoded)
      || (gameId !== null && (typeof gameId !== 'string' || !GAME_ID.test(gameId)))) {
      return response.status(400).json(apiError('INVALID_BODY', 'Send {"v":1,"hpr":"<base64 gzip>","gameId"?:"<uuid>"}'));
    }
    const result = sanitizeReplayUpload(Buffer.from(encoded, 'base64'), dependencies.knownArchetypes);
    if ('code' in result) {
      const status = result.code === 'TOO_LARGE' ? 413 : 400;
      return response.status(status).json(apiError(result.code, result.line ? `Line ${result.line} is not allowed` : 'Not a replay the site takes'));
    }
    const at = now();
    prune(at);
    const stored = dependencies.repository.store(authenticated.userId, result.kind, result.header, result.text, at, gameId);
    if (!stored) return response.status(409).json(apiError('QUOTA_EXCEEDED', 'The account keeps the most replays it may'));
    return response.status(201).json({
      id: stored.id,
      url: `${dependencies.publicOrigin.replace(/\/$/, '')}/replay/${stored.id}`,
      deleteToken: stored.deleteToken,
      events: result.events,
    });
  });

  // Deleting from the app: the token handed out at upload, or the account's own access token.
  router.delete('/v1/tracker/replays/:id', (request, response) => {
    dependencies.setPrivateNoStore(response);
    const id = String(request.params.id);
    if (!REPLAY_ID.test(id)) return response.status(404).json(apiError('NOT_FOUND', 'No such replay'));
    const token = String(request.headers['x-delete-token'] ?? '');
    forget(id);
    if (token && dependencies.repository.deleteWithToken(id, token)) return response.status(204).end();
    const authenticated = dependencies.accessTokens.authenticate(bearerToken(request.headers.authorization), ['tracker.write']);
    if (authenticated && authenticated !== 'FORBIDDEN' && dependencies.repository.deleteOwned(authenticated.userId, id)) {
      return response.status(204).end();
    }
    return response.status(404).json(apiError('NOT_FOUND', 'No such replay of yours'));
  });

  // Public: the file as stored (no names, no N/K lines). Not cached by proxies: a deleted replay is gone at once.
  router.get('/v1/replays/:id', async (request, response) => {
    const id = String(request.params.id);
    response.set('Cache-Control', 'private, no-store');
    const replay = REPLAY_ID.test(id) ? dependencies.repository.read(id, now()) : null;
    if (!replay) {
      forget(id);
      return response.status(404).json(apiError('NOT_FOUND', 'No such replay (it may have been deleted)'));
    }
    response.set('X-Robots-Tag', 'noindex');
    let answer = readCache.get(id);
    if (answer) {
      readCache.delete(id);
    } else {
      const text = gunzipSync(replay.gzip).toString('utf8');
      const ids = [...new Set(text.match(CARD_ID) ?? [])].slice(0, 3000);
      const cardNames = dependencies.resolveCardNames ? await dependencies.resolveCardNames(ids).catch(() => ({})) : {};
      answer = { kind: replay.kind, createdAt: new Date(replay.createdAt).toISOString(), header: replay.header, text, cardNames };
    }
    readCache.set(id, answer);
    if (readCache.size > READ_CACHE_SIZE) readCache.delete(readCache.keys().next().value as string);
    return response.json({ id, ...answer });
  });

  // The account page: the player's replays and deleting one.
  router.get('/account/replays', (request, response) => {
    dependencies.setPrivateNoStore(response);
    const user = dependencies.userAuth(request);
    if (!user) return response.status(401).json(apiError('UNAUTHORIZED', 'Sign in'));
    return response.json({ replays: dependencies.repository.list(user.id, now()).map(replay => ({
      id: replay.id, kind: replay.kind, createdAt: new Date(replay.createdAt).toISOString(), summary: replay.header.summary ?? {},
    })) });
  });

  router.delete('/account/replays/:id', (request, response) => {
    dependencies.setPrivateNoStore(response);
    const user = dependencies.userAuth(request);
    if (!user) return response.status(401).json(apiError('UNAUTHORIZED', 'Sign in'));
    forget(String(request.params.id));
    return dependencies.repository.deleteOwned(user.id, String(request.params.id))
      ? response.status(204).end()
      : response.status(404).json(apiError('NOT_FOUND', 'No such replay of yours'));
  });

  // The retention without uploads too: composition calls this at start and once a day.
  return Object.assign(router, { prune: () => prune(now()) });
}
