import { organizationNode } from '@/shared/seoOrganization';
import type { PublicGuideTeaser } from './publicGuideTeaserData';

const ORIGIN = 'https://hearthpulse.net';
/** The guides' author and publisher are the brand: a reference to the one organization node, which the graph carries. */
const ORGANIZATION = { '@id': `${ORIGIN}/#org` };
/** Class of the block that holds the paywall; the page renders it exactly when text is left out. */
export const GUIDE_PAID_SELECTOR = '.guide-archive-paid';

/** The legacy dates are UTC without a zone (`2017-10-10 20:40:00`). */
function isoDate(value: string | null): string | null {
  if (!value) return null;
  const plain = value.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}:\d{2}))?$/);
  const text = plain ? (plain[2] ? `${plain[1]}T${plain[2]}Z` : plain[1]) : value;
  return Number.isNaN(new Date(text).getTime()) ? null : text;
}

/**
 * `Article` and `BreadcrumbList` of an indexable guide. The paid text is marked, never quoted:
 * no `articleBody` and no `wordCount`, since both would hand out what the paywall holds back.
 */
export function buildGuideStructuredData(teaser: PublicGuideTeaser, fallbackImage: string) {
  const canonical = `${ORIGIN}/guides-archive/${encodeURIComponent(teaser.slug)}/`;
  const published = isoDate(teaser.publishedAt);
  const modified = isoDate(teaser.updatedAt) ?? published;
  const image = teaser.image ? new URL(teaser.image, `${ORIGIN}/`).href : `${ORIGIN}${fallbackImage}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': `${canonical}#article`,
        mainEntityOfPage: canonical,
        headline: teaser.title,
        ...(teaser.description ? { description: teaser.description } : {}),
        image: [image],
        ...(published ? { datePublished: published } : {}),
        ...(modified ? { dateModified: modified } : {}),
        inLanguage: 'ru',
        author: ORGANIZATION,
        publisher: ORGANIZATION,
        isAccessibleForFree: !teaser.hasPaid,
        ...(teaser.hasPaid ? { hasPart: [{
          '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: GUIDE_PAID_SELECTOR,
        }] } : {}),
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${canonical}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Главная', item: `${ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name: 'Архив гайдов', item: `${ORIGIN}/guides-archive/` },
          { '@type': 'ListItem', position: 3, name: teaser.title, item: canonical },
        ],
      },
      organizationNode(),
    ],
  };
}
