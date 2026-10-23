import { Router, type Request, type RequestHandler, type Response } from 'express';
import { isPublicProfileId } from './identity.js';
import {
  serializePublicProfile,
  type PublicProfileCandidate,
} from './model.js';
import {
  nicknameLookupKey,
  validateNickname,
  type NicknameContentCheck,
} from './nickname.js';
import type { NicknameClaimResult, OwnPublicIdentity } from './nicknameRepository.js';

export type PublicProfileRouterDependencies = {
  findProfile: (publicProfileId: string) => PublicProfileCandidate | null;
  findPublicProfileIdByNickname: (nicknameKey: string, now: Date) => string | null;
  readOwnIdentity: (userId: string, now: Date) => OwnPublicIdentity | null;
  claimNickname: (userId: string, nickname: { display: string; key: string }, now: Date) => NicknameClaimResult;
  userAuth: (request: Request) => { id: string } | null;
  csrfAllowed: (request: Request) => boolean;
  setPrivateNoStore: (response: Response) => void;
  /** Per-client budget for the anonymous reads: public IDs are sequential, so enumeration is bounded here. */
  publicReadLimiter: RequestHandler;
  /** Per-client budget for nickname changes, which double as an availability oracle. */
  nicknameChangeLimiter: RequestHandler;
  nicknameContentAllowed?: NicknameContentCheck;
  now?: () => Date;
};

// Short enough that a nickname change or a block shows within a minute; no
// viewer data is ever in these answers, so any shared cache may keep them.
const PUBLIC_PROFILE_CACHE_CONTROL = 'public, max-age=60';
const NOT_FOUND_PAYLOAD = { error: 'Профиль не найден' };

function ownIdentityPayload(identity: OwnPublicIdentity) {
  return { ...identity, profilePath: `/id/${identity.publicProfileId}/` };
}

/**
 * Public profile reads and the owner's nickname controls. Missing, blocked and
 * malformed profiles share one `404` body, so a probe learns nothing beyond
 * "no public profile here".
 */
export function createPublicProfileRouter(
  dependencies: PublicProfileRouterDependencies,
): Router {
  const router = Router();
  const now = dependencies.now ?? (() => new Date());

  router.get('/profiles/by-nickname/:nickname', dependencies.publicReadLimiter, (request, response) => {
    response.set('Cache-Control', PUBLIC_PROFILE_CACHE_CONTROL);
    const key = nicknameLookupKey(request.params.nickname);
    if (!key) return response.status(404).json(NOT_FOUND_PAYLOAD);
    try {
      const publicProfileId = dependencies.findPublicProfileIdByNickname(key, now());
      if (!publicProfileId) return response.status(404).json(NOT_FOUND_PAYLOAD);
      return response.json({ publicProfileId });
    } catch {
      response.set('Cache-Control', 'no-store');
      return response.status(503).json({ error: 'Профиль временно недоступен' });
    }
  });

  router.get('/profiles/:publicProfileId', dependencies.publicReadLimiter, (request, response) => {
    response.set('Cache-Control', PUBLIC_PROFILE_CACHE_CONTROL);
    const { publicProfileId } = request.params;
    if (!isPublicProfileId(publicProfileId)) return response.status(404).json(NOT_FOUND_PAYLOAD);
    try {
      const candidate = dependencies.findProfile(publicProfileId);
      const profile = candidate ? serializePublicProfile(candidate) : null;
      if (!profile) return response.status(404).json(NOT_FOUND_PAYLOAD);
      return response.json({ profile });
    } catch {
      response.set('Cache-Control', 'no-store');
      return response.status(503).json({ error: 'Профиль временно недоступен' });
    }
  });

  router.get('/account/public-profile', (request, response) => {
    dependencies.setPrivateNoStore(response);
    const user = dependencies.userAuth(request);
    if (!user) return response.status(401).json({ error: 'Требуется вход' });
    try {
      const identity = dependencies.readOwnIdentity(user.id, now());
      if (!identity) return response.status(404).json({ error: 'Публичный профиль ещё не создан' });
      return response.json(ownIdentityPayload(identity));
    } catch {
      return response.status(503).json({ error: 'Не удалось загрузить публичный профиль' });
    }
  });

  router.put('/account/public-profile/nickname', dependencies.nicknameChangeLimiter, (request, response) => {
    dependencies.setPrivateNoStore(response);
    // The application-wide CSRF gate runs first in production; this repeats it
    // so the route stays safe when composed elsewhere (tests, a sub-app).
    if (!dependencies.csrfAllowed(request)) {
      return response.status(403).json({ error: 'Запрос отклонён: обновите страницу' });
    }
    const user = dependencies.userAuth(request);
    if (!user) return response.status(401).json({ error: 'Требуется вход' });
    const validation = validateNickname((request.body as { nickname?: unknown } | undefined)?.nickname,
      dependencies.nicknameContentAllowed);
    if (validation.ok === false) {
      return response.status(400).json({ error: validation.message, reason: validation.reason });
    }
    try {
      const result = dependencies.claimNickname(user.id, validation, now());
      switch (result.status) {
        case 'saved':
          return response.json({ success: true, ...ownIdentityPayload(result.identity) });
        case 'taken':
          return response.status(409).json({ error: 'Этот ник уже занят, выберите другой', reason: 'taken' });
        case 'cooldown':
          return response.status(429).json({
            error: 'Ник можно менять раз в 30 дней',
            reason: 'cooldown',
            availableAt: result.availableAt,
          });
        default:
          return response.status(401).json({ error: 'Пользователь не найден' });
      }
    } catch {
      return response.status(503).json({ error: 'Не удалось сохранить ник' });
    }
  });

  return router;
}
