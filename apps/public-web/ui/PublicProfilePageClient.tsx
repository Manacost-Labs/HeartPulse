'use client';

import dynamic from 'next/dynamic';
import { PublicPageShell } from '../../../src/app/shell/PublicPageShell';
import { loadPublicProfileCard, publicProfilePath, type PublicProfile } from '../../../src/modules/identity/public';
import { usePublicAccess } from './usePublicAccess';

const PublicProfileCard = dynamic(loadPublicProfileCard);
const navigate = (path: string) => window.location.assign(path);

export function PublicProfilePageClient({ profile, pathname }: { profile: PublicProfile; pathname: string }) {
  const access = usePublicAccess();
  return <PublicPageShell activeTab="home" pathname={pathname} access={access} navigate={navigate}>
    <div className="public-profile-page">
      <PublicProfileCard profile={profile} onCopyLink={() => navigator.clipboard.writeText(
        new URL(publicProfilePath(profile.publicProfileId), window.location.origin).href,
      )} />
    </div>
  </PublicPageShell>;
}
