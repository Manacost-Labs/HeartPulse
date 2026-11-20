import structuredDataRegistry from '@/config/public-seo-structured-data.json';
import type { SchemaNode } from '@/src/seo/structuredData';
import { tierlistClassPath } from './tierlistClassPages';
import { tierlistClassName } from './tierlistClassSeo';

const SITE = 'https://hearthpulse.net';
const NEUTRAL_ID = 'any';

// The tier list's Dataset (config/public-seo-structured-data.json): a class page shows a part of the same data from the
// same sources, behind the same paywall (`.paywalled-tierlist`), so it keeps its sources, measures and closed part.
const HUB_DATASET = (structuredDataRegistry.pages['/tierlist'] as SchemaNode[]).find(node => node['@type'] === 'Dataset');
if (!HUB_DATASET) throw new Error('The /tierlist structured data has no Dataset');
const { isAccessibleForFree, hasPart, isBasedOn, variableMeasured, keywords, about } = HUB_DATASET;

/** The Dataset of a class page: what the open page shows of the class, the rest for subscribers. No figures. */
function classDataset(classId: string, url: string): SchemaNode {
  const neutral = classId === NEUTRAL_ID;
  const name = neutral ? 'Тир-лист нейтральных карт Арены Hearthstone' : `Тир-лист карт Арены Hearthstone: ${tierlistClassName(classId)}`;
  const cards = neutral ? 'все нейтральные карты' : 'все карты класса';
  return {
    '@type': 'Dataset', '@id': `${url}#dataset`, name,
    description: `${name} с оценками от S до F по данным HSReplay, HearthArena и Firestone. На открытой странице — ${cards}`
      + ' с тиром, винрейтом и частотой выбора, дата обновления и нижняя граница числа игр. Остальные показатели карт,'
      + ' узкие фильтры и история доступны по подписке.',
    url, isAccessibleForFree, hasPart, isBasedOn, variableMeasured, keywords, about,
  };
}

/**
 * JSON-LD nodes of a class page of the Arena tier list (#617): the breadcrumb the page shows («Главная › Тир-лист ›
 * <класс>»), the page itself with its meta title and description, and the Dataset of its cards (#668), as on
 * `/tierlist/`. `seoStructuredDataGraphOf` adds the organization, the language, the breadcrumb link, `dateModified`
 * and the publisher, and writes nothing for a page that is not indexable.
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
    classDataset(classId, url),
  ];
}
