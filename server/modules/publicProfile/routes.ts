import { Router } from 'express';
import { isPublicProfileLookupId } from './identity.js';
import {
  serializePublicProfile,
  type PublicProfileCandidate,
} from './model.js';

export type PublicProfileRouterDependencies = {
  findProfile: (publicProfileId: string) => PublicProfileCandidate | null;
};

const PUBLIC_PROFILE_CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=300';
const NOT_FOUND_PAYLOAD = { error: 'Профиль не найден' };

export function createPublicProfileRouter(
  dependencies: PublicProfileRouterDependencies,
): Router {
  const router = Router();

  router.get('/profiles/:publicProfileId', (request, response) => {
    response.set('Cache-Control', PUBLIC_PROFILE_CACHE_CONTROL);
    const publicProfileId = request.params.publicProfileId;
    if (!isPublicProfileLookupId(publicProfileId)) {
      return response.status(404).json(NOT_FOUND_PAYLOAD);
    }

    try {
      const profile = dependencies.findProfile(publicProfileId);
      if (!profile) return response.status(404).json(NOT_FOUND_PAYLOAD);
      return response.json({ profile: serializePublicProfile(profile) });
    } catch {
      return response.status(503).json({ error: 'Профиль временно недоступен' });
    }
  });

  return router;
}
