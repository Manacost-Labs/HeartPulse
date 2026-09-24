'use client';
import { PublicPageShell } from '../../../src/app/shell/PublicPageShell';
import GalleryTab from '../../../src/features/GalleryTab';
import type { PublicGalleryData } from '../lib/publicGallery';
import { usePublicAccess } from './usePublicAccess';

const navigate = (path: string) => { window.location.assign(path); };

export function GalleryPageClient({ data }: { data: PublicGalleryData }) {
  const access = usePublicAccess();
  return <PublicPageShell activeTab="gallery" pathname="/gallery/" access={access} navigate={navigate} editorial>
    <GalleryTab data={data} loading={false} onNavigate={() => navigate('/')} />
  </PublicPageShell>;
}
