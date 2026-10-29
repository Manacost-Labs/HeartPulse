import 'server-only';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resolvePublicUrlPolicy } from '@/src/shared/seo/publicUrlPolicy';
import { robotsContent } from '@/src/shared/seo/robots';
import { isIndexableArchetype } from '@/shared/constructedArchetypeIndexing';
import { SHARE_IMAGE_HEIGHT, SHARE_IMAGE_WIDTH, shareImagePath } from '@/shared/shareImages';
import { loadPublicArchetypeCatalogTeaser } from './publicArchetypeCatalogTeaser';
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
  // `detail.format` is the narrowed `'standard' | 'wild'` the checks above proved.
  return { format: detail.format, slug: archetypeSlug, detail };
}

/**
 * The public catalog of the archetype's format: the page's title tells a name
 * shared with another row apart, and its text compares and links within it.
 * `null` when the catalog does not answer in time (the read is cached per
 * render, so the metadata and the page ask Express once).
 */
export function loadArchetypeFormatCatalog(format: 'standard' | 'wild') {
  return loadPublicArchetypeCatalogTeaser(`?format=${format}`);
}

export async function archetypeDetailMetadata(params: ArchetypeRouteParams, family: ArchetypeFamily): Promise<Metadata> {
  const { format, slug, detail } = await resolveArchetypeRoute(params);
  const pathname = `/standard/${family}/${format}/${slug}`;
  const policy = await resolvePublicUrlPolicy(pathname, '');
  const { title, description } = archetypeDetailSeoText(detail, Date.now(), await loadArchetypeFormatCatalog(format));
  // nginx redirects the old `meta` family to `archetypes`; a page served without it still names the one real URL.
  const canonical = family === 'meta'
    ? `https://hearthpulse.net/standard/archetypes/${format}/${slug}/`
    : policy.canonicalUrl ?? `https://hearthpulse.net${pathname}/`;
  return {
    title, description, alternates: { canonical },
    // The route is indexable; a single page is only when its archetype is (and only in the family that is canonical).
    robots: policy.indexPolicy === 'index' && !isIndexableArchetype(detail.item) ? robotsContent('noindex-follow') : policy.robots,
    openGraph: { type: 'article', url: canonical, siteName: 'HearthPulse', locale: 'ru_RU', title, description,
      images: [{ url: shareImagePath('standard'), alt: 'HearthPulse — архетип Hearthstone', width: SHARE_IMAGE_WIDTH, height: SHARE_IMAGE_HEIGHT }] },
  };
}
