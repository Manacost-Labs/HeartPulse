import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import '../../../../../src/route-parchment.css';
import '../../../../../src/modules/identity/ui/IdentityProfile.css';
import { loadPublicProfile, publicProfileMetadata } from '../../../lib/publicProfile';
import { PublicProfilePageClient } from '../../../ui/PublicProfilePageClient';

type Props = { params: Promise<{ legacyPublicProfileId: string }> };
export const dynamic = 'force-dynamic';

async function resolveProfile(params: Props['params']) {
  const { legacyPublicProfileId } = await params;
  const profile = await loadPublicProfile('legacy', legacyPublicProfileId);
  if (!profile) notFound();
  return profile;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return publicProfileMetadata(await resolveProfile(params));
}

export default async function Page({ params }: Props) {
  const { legacyPublicProfileId } = await params;
  const profile = await resolveProfile(params);
  return <PublicProfilePageClient profile={profile} pathname={`/profiles/${legacyPublicProfileId}/`} />;
}
