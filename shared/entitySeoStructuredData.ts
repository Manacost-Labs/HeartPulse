type Breadcrumb = { name: string; item: string };

type EntityStructuredDataOptions = {
  canonical: string;
  title: string;
  description: string;
  origin: string;
  image: string;
  entityFragment: 'card' | 'hero';
  entity: Record<string, unknown>;
  breadcrumbs: Breadcrumb[];
};

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
        isPartOf: {
          '@type': 'WebSite',
          '@id': `${options.origin}/#website`,
          name: 'HearthPulse',
          url: `${options.origin}/`,
        },
        primaryImageOfPage: { '@type': 'ImageObject', contentUrl: options.image },
        mainEntity: { '@id': entityId },
        breadcrumb: { '@id': `${options.canonical}#breadcrumb` },
      },
      {
        '@type': 'CreativeWork',
        '@id': entityId,
        url: options.canonical,
        ...options.entity,
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${options.canonical}#breadcrumb`,
        itemListElement: options.breadcrumbs.map((breadcrumb, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          ...breadcrumb,
        })),
      },
    ],
  };
}
