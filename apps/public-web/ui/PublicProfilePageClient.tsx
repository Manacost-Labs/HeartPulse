'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { loadPublicProfileCard, type PublicProfile } from '@/src/modules/identity/public';
import { usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

const PublicProfileCard = dynamic(loadPublicProfileCard);
// Only profiles that show their games load the statistics views and their UI kits.
const PublicPlayerStats = dynamic(() => import('@/src/features/playerStats/PublicPlayerStats'));

export function PublicProfilePageClient({ profile, pathname }: { profile: PublicProfile; pathname: string }) {
  const access = usePublicAccess();
  const card = ({ summary, children }: { summary?: ReactNode; children?: ReactNode }) => (
    // The server validated the numeric ID; the shared link is the canonical page.
    <PublicProfileCard profile={profile} signedIn={Boolean(access.user)} summary={summary} onCopyLink={() => navigator.clipboard.writeText(
      new URL(`/id/${profile.publicProfileId}/`, window.location.origin).href,
    )}>
      {children}
    </PublicProfileCard>
  );
  return <PublicPageShell activeTab="home" pathname={pathname} account access={access} navigate={navigate}>
    {profile.showsStats ? <PublicPlayerStats publicProfileId={profile.publicProfileId} card={card} /> : card({})}
  </PublicPageShell>;
}
