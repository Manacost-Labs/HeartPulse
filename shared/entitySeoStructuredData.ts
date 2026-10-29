type Breadcrumb = { name: string; item: string };

type EntityStructuredDataOptions = {
  canonical: string;
  title: string;
  description: string;
  origin: string;
  /** Absolute image URL; a page without a picture omits `primaryImageOfPage`. */
  image: string | null;
  entityFragment: 'card' | 'hero';
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

/** Reference to the site node declared on the home page; every page links to it by `@id`. */
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
    ],
  };
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
    ],
  };
}
