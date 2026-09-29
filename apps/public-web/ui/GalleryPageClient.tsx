'use client';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import GalleryTab from '@/src/features/GalleryTab';
import type { PublicGalleryData } from '@/apps/public-web/lib/publicGallery';
import { usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

export function GalleryPageClient({ data }: { data: PublicGalleryData }) {
  const access = usePublicAccess();
  return <PublicPageShell activeTab="gallery" pathname="/gallery/" access={access} navigate={navigate} editorial>
    <GalleryTab data={data} loading={false} onNavigate={() => navigate('/')} />
  </PublicPageShell>;
}
