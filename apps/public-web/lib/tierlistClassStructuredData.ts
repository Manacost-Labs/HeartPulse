import type { SchemaNode } from '@/src/seo/structuredData';
import { tierlistClassPath } from './tierlistClassPages';
import { tierlistClassName } from './tierlistClassSeo';

const SITE = 'https://hearthpulse.net';

/**
 * JSON-LD nodes of a class page of the Arena tier list (#617): the breadcrumb the page shows («Главная › Тир-лист ›
 * <класс>») and the page itself with its meta title and description. `seoStructuredDataGraphOf` adds the
 * organization, the language, the breadcrumb link and `dateModified`, and writes nothing while the page is not
 * indexable (the route is `noindex-follow` until SEO-A indexes it).
 */
export function tierlistClassStructuredNodes(classId: string, page: { title: string; description: string }): SchemaNode[] {
  const url = `${SITE}${tierlistClassPath(classId)}`;
  return [
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Главная', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Тир-лист', item: `${SITE}/tierlist/` },
        { '@type': 'ListItem', position: 3, name: tierlistClassName(classId), item: url },
      ],
    },
    { '@type': 'CollectionPage', '@id': `${url}#webpage`, url, name: page.title, description: page.description },
  ];
}
