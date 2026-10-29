import 'server-only';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resolvePublicUrlPolicy } from '@/src/shared/seo/publicUrlPolicy';
import { SHARE_IMAGE_HEIGHT, SHARE_IMAGE_WIDTH, shareImagePath } from '@/shared/shareImages';
import { loadPublicArchetypeTeaser } from './publicArchetypeTeaser';
import { archetypeDetailSeoText } from './seoDataValues';

export type ArchetypeRouteParams = Promise<{ format: string; archetypeSlug: string }>;
export type ArchetypeFamily = 'archetypes' | 'meta';

export async function resolveArchetypeRoute(params: ArchetypeRouteParams) {
  const { format, archetypeSlug } = await params;
  if (format !== 'standard' && format !== 'wild') notFound();
  if (!/^[a-z0-9-]{1,90}$/.test(archetypeSlug)) notFound();
  const detail = await loadPublicArchetypeTeaser(format, archetypeSlug);
  if (!detail) notFound();
  return { format, slug: archetypeSlug, detail };
}

export async function archetypeDetailMetadata(params: ArchetypeRouteParams, family: ArchetypeFamily): Promise<Metadata> {
  const { format, slug, detail } = await resolveArchetypeRoute(params);
  const pathname = `/standard/${family}/${format}/${slug}`;
  const policy = await resolvePublicUrlPolicy(pathname, '');
  const { title, description } = archetypeDetailSeoText(detail, Date.now());
  const canonical = policy.canonicalUrl ?? `https://hearthpulse.net${pathname}/`;
  return {
    title, description, alternates: { canonical },
    robots: policy.robots,
    openGraph: { type: 'article', url: canonical, siteName: 'HearthPulse', locale: 'ru_RU', title, description,
      images: [{ url: shareImagePath('standard'), alt: 'HearthPulse — архетип Hearthstone', width: SHARE_IMAGE_WIDTH, height: SHARE_IMAGE_HEIGHT }] },
  };
}
