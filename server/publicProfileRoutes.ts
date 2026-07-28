import { Router } from 'express';
import { isPublicProfileId } from './publicProfileIdentity.js';

export type PublicProfileRecord = {
  publicProfileId: string;
  name: string;
  avatarInitials: string;
  createdAt: string;
};

type PublicProfileSource = PublicProfileRecord & Record<string, unknown>;

export type PublicProfileRouterDependencies = {
  findProfile: (publicProfileId: string) => PublicProfileSource | null;
};

const PUBLIC_PROFILE_CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=300';
const NOT_FOUND_PAYLOAD = { error: 'Профиль не найден' };

function normalizedText(value: unknown, maxLength: number): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, maxLength);
}

export function serializePublicProfile(source: PublicProfileSource): PublicProfileRecord {
  const name = normalizedText(source.name, 120) || 'Пользователь Манакоста';
  return {
    publicProfileId: source.publicProfileId,
    name,
    avatarInitials: normalizedText(source.avatarInitials, 4)
      || name.slice(0, 2).toUpperCase(),
    createdAt: normalizedText(source.createdAt, 40),
  };
}

export function createPublicProfileRouter(
  dependencies: PublicProfileRouterDependencies,
): Router {
  const router = Router();

  router.get('/profiles/:publicProfileId', (request, response) => {
    response.set('Cache-Control', PUBLIC_PROFILE_CACHE_CONTROL);
    const publicProfileId = request.params.publicProfileId;
    if (!isPublicProfileId(publicProfileId)) {
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
