'use client';

import dynamic from 'next/dynamic';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { loadPublicProfileCard, type PublicProfile } from '@/src/modules/identity/public';
import { usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

const PublicProfileCard = dynamic(loadPublicProfileCard);

export function PublicProfilePageClient({ profile, pathname }: { profile: PublicProfile; pathname: string }) {
  const access = usePublicAccess();
  return <PublicPageShell activeTab="home" pathname={pathname} account access={access} navigate={navigate}>
    {/* The server validated the numeric ID; the shared link is the canonical page. */}
    <PublicProfileCard profile={profile} signedIn={Boolean(access.user)} onCopyLink={() => navigator.clipboard.writeText(
      new URL(`/id/${profile.publicProfileId}/`, window.location.origin).href,
    )} />
  </PublicPageShell>;
}
