import { organizationNode } from './seoOrganization.js';

type Breadcrumb = { name: string; item: string };

type EntityStructuredDataOptions = {
  canonical: string;
  title: string;
  description: string;
  origin: string;
  /** Absolute image URL; a page without a picture omits `primaryImageOfPage`. */
  image: string | null;
  entityFragment: 'card' | 'hero' | 'cosmetic';
  entity: Record<string, unknown>;
  breadcrumbs: Breadcrumb[];
};

type CollectionStructuredDataOptions = {
  canonical: string;
  origin: string;
  name: string;
  /** The listed entities, for example an `ItemList`. */
  mainEntity: Record<string, unknown>;
  breadcrumbs: Breadcrumb[];
};

/**
 * The site node, written in full where a page links it: a `WebSite` with its `@id`, name and
 * address is a definition inside this document, not a bare reference. The home page node
 * (`config/public-seo-structured-data.json`) carries the same `@id` and adds the description.
 */
function websiteReference(origin: string) {
  return {
    '@type': 'WebSite',
    '@id': `${origin}/#website`,
    name: 'HearthPulse',
    url: `${origin}/`,
  };
}

function breadcrumbList(canonical: string, breadcrumbs: Breadcrumb[]) {
  return {
    '@type': 'BreadcrumbList',
    '@id': `${canonical}#breadcrumb`,
    itemListElement: breadcrumbs.map((breadcrumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      ...breadcrumb,
    })),
  };
}

export function buildEntityStructuredData(options: EntityStructuredDataOptions) {
  const entityId = `${options.canonical}#${options.entityFragment}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${options.canonical}#webpage`,
        url: options.canonical,
        name: options.title,
        description: options.description,
        inLanguage: 'ru',
        isPartOf: websiteReference(options.origin),
        ...(options.image ? { primaryImageOfPage: { '@type': 'ImageObject', contentUrl: options.image } } : {}),
        mainEntity: { '@id': entityId },
        breadcrumb: { '@id': `${options.canonical}#breadcrumb` },
      },
      {
        '@type': 'CreativeWork',
        '@id': entityId,
        url: options.canonical,
        ...options.entity,
      },
      breadcrumbList(options.canonical, options.breadcrumbs),
      organizationNode(),
    ],
  };
}

type CosmeticStructuredDataOptions = {
  origin: string;
  kind: 'heroes' | 'coins' | 'pets';
  cardId: string;
  dbf: number | null | undefined;
  /** The name the page prints: the graph repeats it. */
  name: string;
  englishName: string | null;
  description: string;
  image: string | null;
};

const COSMETIC_SECTIONS = { heroes: 'Скины героев', coins: 'Косметические монеты', pets: 'Питомцы' } as const;

/**
 * Graph of a cosmetic item page (hero skin, coin, pet): its page, the item, the breadcrumb
 * «Главная → Косметика → раздел → предмет» and the site organization. The one source of the
 * Next page and of the server-rendered copy, so both print the same text. No `creator`:
 * the artist of a card is not the author of the site's page, and the site names no person.
 */
export function buildCosmeticStructuredData(options: CosmeticStructuredDataOptions) {
  const canonical = `${options.origin}/cosmetics/${options.kind}/${encodeURIComponent(options.cardId)}/`;
  const title = `${options.name} — косметика Hearthstone | HearthPulse`;
  return buildEntityStructuredData({
    canonical, title, description: options.description, origin: options.origin, image: options.image,
    entityFragment: 'cosmetic',
    entity: {
      name: options.name,
      ...(options.englishName ? { alternateName: options.englishName } : {}),
      description: options.description,
      inLanguage: 'ru',
      ...(options.image ? { image: options.image } : {}),
      identifier: [
        { '@type': 'PropertyValue', propertyID: 'card_id', value: options.cardId },
        ...(typeof options.dbf === 'number' && Number.isInteger(options.dbf)
          ? [{ '@type': 'PropertyValue', propertyID: 'dbf', value: options.dbf }] : []),
      ],
    },
    breadcrumbs: [
      { name: 'Главная', item: `${options.origin}/` },
      { name: 'Косметика', item: `${options.origin}/cosmetics/` },
      { name: COSMETIC_SECTIONS[options.kind], item: `${options.origin}/cosmetics/${options.kind}/` },
      { name: options.name, item: canonical },
    ],
  });
}

/** A listing page: its `CollectionPage` carries the list and links the breadcrumb and the site. */
export function buildCollectionStructuredData(options: CollectionStructuredDataOptions) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${options.canonical}#collection`,
        url: options.canonical,
        name: options.name,
        inLanguage: 'ru',
        isPartOf: websiteReference(options.origin),
        breadcrumb: { '@id': `${options.canonical}#breadcrumb` },
        mainEntity: options.mainEntity,
      },
      breadcrumbList(options.canonical, options.breadcrumbs),
      organizationNode(),
    ],
  };
}
