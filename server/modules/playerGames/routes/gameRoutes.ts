import { Router, type Request, type Response } from 'express';
import { DESKTOP_GAMES_CLIENT_ID, MAX_GAMES_PER_BATCH } from '../model/game.js';
import type { PlayerGameStore } from '../repository/gameStore.js';
import { clientGameId } from '../schema/gameSchema.js';
import { ingestGameBatch } from '../service/ingestGames.js';

/** What the identity provider proves about a bearer token; never the token itself. */
export type GameUploadToken = { userId: string; clientId: string; scopes: readonly string[] };

export type GameRoutesDependencies = {
  /** `null` when the identity provider is not configured on this deployment. */
  accessTokens: { verify: (token: string) => Promise<GameUploadToken | null> } | null;
  store: PlayerGameStore;
  setPrivateNoStore: (response: Response) => void;
  /** A provider scope the token must carry; `null` until the provider issues one. */
  requiredScope?: string | null;
  now?: () => number;
};

const apiError = (code: string, message: string) => ({ error: { code, message } });

function bearerToken(request: Request): string {
  const value = String(request.headers.authorization ?? '').trim();
  return /^bearer /i.test(value) ? value.slice(7).trim() : '';
}

function encodeCursor(cursor: { startedAt: number; id: string } | null): string | null {
  return cursor ? Buffer.from(`${cursor.startedAt}:${cursor.id}`).toString('base64url') : null;
}

function decodeCursor(value: unknown): { startedAt: number; id: string } | null | 'invalid' {
  if (value === undefined) return null;
  if (typeof value !== 'string' || value.length > 160) return 'invalid';
  const decoded = Buffer.from(value, 'base64url').toString('utf8');
  const match = /^(\d{1,15}):([A-Za-z0-9][A-Za-z0-9._:-]{7,63})$/.exec(decoded);
  return match ? { startedAt: Number(match[1]), id: match[2] } : 'invalid';
}

/**
 * `POST /me/games` and `GET /me/games` for the desktop tracker
 * (docs/specs/player-game-stats.md). Authorization stays at this boundary:
 * the verified token's account owns every game written or listed.
 */
export function createPlayerGameRouter(dependencies: GameRoutesDependencies): Router {
  const router = Router();
  const now = dependencies.now ?? Date.now;

  async function authorize(request: Request, response: Response): Promise<string | null> {
    dependencies.setPrivateNoStore(response);
    if (!dependencies.accessTokens) {
      response.status(503).json(apiError('IDENTITY_UNAVAILABLE', 'Sign-in for the desktop application is not configured'));
      return null;
    }
    const value = bearerToken(request);
    const token = value && value.length <= 4096 ? await dependencies.accessTokens.verify(value) : null;
    if (!token) {
      response.set('WWW-Authenticate', 'Bearer realm="HearthPulse"');
      response.status(401).json(apiError('INVALID_ACCESS_TOKEN', 'Access token is invalid or expired'));
      return null;
    }
    if (token.clientId !== DESKTOP_GAMES_CLIENT_ID) {
      response.status(403).json(apiError('CLIENT_NOT_ALLOWED', 'Only the Hearthpulse desktop application may upload games'));
      return null;
    }
    if (dependencies.requiredScope && !token.scopes.includes(dependencies.requiredScope)) {
      response.status(403).json(apiError('INSUFFICIENT_SCOPE', `Access token does not grant ${dependencies.requiredScope}`));
      return null;
    }
    return token.userId;
  }

  router.post('/me/games', async (request, response) => {
    const userId = await authorize(request, response);
    if (!userId) return;
    const games = request.body?.games;
    if (!Array.isArray(games) || games.length < 1 || games.length > MAX_GAMES_PER_BATCH) {
      response.status(400).json(apiError('INVALID_BATCH', `Batch must contain 1 to ${MAX_GAMES_PER_BATCH} games`));
      return;
    }
    if (games.some(game => !clientGameId(game))) {
      response.status(400).json(apiError('INVALID_BATCH', 'Every game needs a valid id'));
      return;
    }
    let results;
    try {
      results = ingestGameBatch(dependencies.store, userId, games, now());
    } catch {
      response.status(503).json(apiError('STORAGE_UNAVAILABLE', 'Games could not be stored, retry later'));
      return;
    }
    response.json({ results });
  });

  router.get('/me/games', async (request, response) => {
    const userId = await authorize(request, response);
    if (!userId) return;
    const limit = request.query.limit === undefined ? 100 : Number(request.query.limit);
    const since = request.query.since === undefined ? null : Date.parse(String(request.query.since));
    const before = decodeCursor(request.query.before);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500 || Number.isNaN(since) || before === 'invalid') {
      response.status(400).json(apiError('INVALID_QUERY', 'limit must be 1-500, since an ISO date, before a cursor'));
      return;
    }
    try {
      const page = dependencies.store.listGames(userId, { limit, since, before });
      response.json({
        total: page.total,
        byMode: page.byMode,
        latestStartedAt: page.latestStartedAt === null ? null : new Date(page.latestStartedAt).toISOString(),
        games: page.games.map(game => ({ id: game.id, mode: game.mode,
          startedAt: new Date(game.startedAt).toISOString(), updatedAt: new Date(game.updatedAt).toISOString() })),
        nextBefore: encodeCursor(page.next),
      });
    } catch {
      response.status(503).json(apiError('STORAGE_UNAVAILABLE', 'Games could not be read, retry later'));
    }
  });

  return router;
}
