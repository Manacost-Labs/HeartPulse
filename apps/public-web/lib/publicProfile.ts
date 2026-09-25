import 'server-only';
import { cache } from 'react';
import type { Metadata } from 'next';
import type { PublicProfile } from '../../../src/modules/identity/public';

type ProfileRouteKind = 'numeric' | 'legacy';
const numericId = /^[1-9][0-9]{0,9}$/;
const legacyId = /^p_[A-Za-z0-9_-]{22}$/;

function validNumericId(value: string): boolean {
  return numericId.test(value) && Number(value) <= 2_147_483_647;
}

// The server adapter keeps its wire validation local to avoid importing the
// browser identity graph into an App Router server component.
function publicProfileFromPayload(value: unknown): PublicProfile | null {
  if (!value || typeof value !== 'object') return null;
  const profile = (value as { profile?: unknown }).profile;
  if (!profile || typeof profile !== 'object') return null;
  const fields = profile as Record<string, unknown>;
  if (typeof fields.publicProfileId !== 'string' || !validNumericId(fields.publicProfileId)
    || typeof fields.name !== 'string' || typeof fields.avatarInitials !== 'string'
    || typeof fields.createdAt !== 'string') return null;
  return { publicProfileId: fields.publicProfileId, name: fields.name,
    avatarInitials: fields.avatarInitials, createdAt: fields.createdAt };
}

/** Reads only the Express public-profile projection, without browser cookies. */
export const loadPublicProfile = cache(async (kind: ProfileRouteKind, id: string): Promise<PublicProfile | null> => {
  if (kind === 'numeric' ? !validNumericId(id) : !legacyId.test(id)) return null;
  const origin = new URL(process.env.LEGACY_WEB_ORIGIN ?? 'http://127.0.0.1:3001');
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/') {
    throw new Error('Invalid legacy origin');
  }
  const response = await fetch(new URL(`/api/profiles/${encodeURIComponent(id)}`, origin), {
    cache: 'no-store', credentials: 'omit', redirect: 'error',
    signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json' },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Public profile temporarily unavailable');
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('Public profile API returned a non-JSON response');
  }
  const profile = publicProfileFromPayload(await response.json());
  if (!profile) {
    throw new Error('Invalid public profile projection');
  }
  return profile;
});

export function publicProfileMetadata(profile: PublicProfile): Metadata {
  return {
    title: `${profile.name} — профиль | Manacost Stats`,
    description: `Публичный профиль участника ${profile.name} на Manacost Stats.`,
    alternates: { canonical: `https://hearthpulse.net/id/${profile.publicProfileId}/` },
    robots: { index: false, follow: true },
  };
}
