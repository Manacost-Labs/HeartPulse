import type { Metadata } from 'next';
import { constructedCardPath, type CardFormat } from '../../../src/modules/constructedCards/public';
import { loadPublicCatalog } from '../lib/publicCatalog';
import { LegacyCardPage } from './LegacyCardPage';
import { resolvePublicUrlPolicy } from '../../../src/shared/seo/publicUrlPolicy';

export type CatalogSearch = Promise<Record<string, string | string[] | undefined>>;
async function catalogSearch(searchParams: CatalogSearch) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  }
  return query.toString();
}
export async function catalogMetadata(format: CardFormat, pathname: string, searchParams: CatalogSearch): Promise<Metadata> {
  const title = `Карты Hearthstone — ${format === 'wild' ? 'Вольный формат' : 'Стандарт'} | HearthPulse`;
  const description = 'Библиотека карт Hearthstone: поиск, дополнения, классы, характеристики и статистика.';
  const canonical = `https://hearthpulse.net${pathname}`;
  const policy = await resolvePublicUrlPolicy(pathname, await catalogSearch(searchParams));
  return { title, description, alternates: { canonical }, robots: { index: policy.indexPolicy === 'index', follow: policy.indexPolicy !== 'noindex-nofollow', 'max-image-preview': 'large' }, openGraph: { title, description, url: canonical } };
}

export async function CardCatalogPage({ format, pathname, searchParams }: { format: CardFormat; pathname: string; searchParams: CatalogSearch }) {
  const query = await catalogSearch(searchParams);
  const catalog = await loadPublicCatalog(format, query);
  const canonical = `https://hearthpulse.net${pathname}`;
  const structured = { '@context': 'https://schema.org', '@type': 'CollectionPage', '@id': canonical, url: canonical, name: 'Карты Hearthstone', mainEntity: {
    '@type': 'ItemList', numberOfItems: catalog.pagination.total,
    itemListElement: catalog.cards.map((card, index) => ({ '@type': 'ListItem', position: (catalog.pagination.page - 1) * catalog.pagination.perPage + index + 1, name: card.name.ru, url: `https://hearthpulse.net${constructedCardPath(format, card.card_id)}/` })),
  } };
  return <>
    <script type="application/ld+json" data-server-entity-jsonld data-entity-path={pathname}
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, '\\u003c') }} />
    <LegacyCardPage catalog={catalog} pathname={pathname} initialSearch={query} />
  </>;
}
