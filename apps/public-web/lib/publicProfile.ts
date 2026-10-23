import 'server-only';
import { cache } from 'react';
import type { Metadata } from 'next';
import type { PublicProfile } from '@/src/modules/identity/public';
import { fetchPublicExpress } from './expressApi';

const SITE_URL = 'https://hearthpulse.net';
const SHARE_IMAGE = '/assets/og-preview.png';
const numericId = /^[1-9][0-9]{0,9}$/;

function validNumericId(value: unknown): value is string {
  return typeof value === 'string' && numericId.test(value) && Number(value) <= 2_147_483_647;
}

// The server adapter keeps its wire validation local to avoid importing the
// browser identity graph into an App Router server component. It copies only
// the contract's fields, so an extra field from a faulty API never renders.
function publicProfileFromPayload(value: unknown): PublicProfile | null {
  if (!value || typeof value !== 'object') return null;
  const profile = (value as { profile?: unknown }).profile;
  if (!profile || typeof profile !== 'object') return null;
  const fields = profile as Record<string, unknown>;
  if (!validNumericId(fields.publicProfileId)
    || (fields.nickname !== null && typeof fields.nickname !== 'string')
    || typeof fields.displayName !== 'string' || typeof fields.avatarInitials !== 'string'
    || typeof fields.memberSince !== 'string' || typeof fields.isSubscriber !== 'boolean') return null;
  return { publicProfileId: fields.publicProfileId, nickname: fields.nickname as string | null,
    displayName: fields.displayName, avatarInitials: fields.avatarInitials,
    memberSince: fields.memberSince, isSubscriber: fields.isSubscriber };
}

async function readJson(response: Response, what: string): Promise<unknown> {
  if (!response.ok) throw new Error(`${what} temporarily unavailable`);
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error(`${what} API returned a non-JSON response`);
  }
  return response.json();
}

/** Reads only the anonymous Express projection, without browser cookies. */
export const loadPublicProfile = cache(async (id: string): Promise<PublicProfile | null> => {
  if (!validNumericId(id)) return null;
  const response = await fetchPublicExpress(`/api/profiles/${encodeURIComponent(id)}`);
  if (response.status === 404) return null;
  const profile = publicProfileFromPayload(await readJson(response, 'Public profile'));
  if (!profile) throw new Error('Invalid public profile projection');
  return profile;
});

/**
 * Profiles stay `noindex`: there is no public user content on them yet, so an
 * indexed page would be thin and only expose the member list to search.
 */
export function publicProfileMetadata(profile: PublicProfile): Metadata {
  const url = `${SITE_URL}/id/${profile.publicProfileId}/`;
  const title = `${profile.displayName} — профиль игрока | HearthPulse`;
  const description = profile.nickname
    ? `Профиль игрока ${profile.nickname} на HearthPulse — статистика Hearthstone.`
    : 'Профиль игрока на HearthPulse — статистика Hearthstone.';
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: false, follow: true },
    openGraph: {
      type: 'profile', url, title, description, siteName: 'HearthPulse', locale: 'ru_RU',
      ...(profile.nickname ? { username: profile.nickname } : {}),
      images: [{ url: SHARE_IMAGE, alt: 'HearthPulse — статистика Hearthstone', width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [SHARE_IMAGE] },
  };
}
