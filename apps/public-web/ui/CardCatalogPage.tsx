import { PageBannerPreload } from './PageBannerPreload';
import type { Metadata } from 'next';
import { constructedCardPath, type CardFormat } from '@/src/modules/constructedCards/public';
import { loadPublicCatalog } from '@/apps/public-web/lib/publicCatalog';
import { LegacyCardPage } from './LegacyCardPage';
import { resolvePublicUrlPolicy } from '@/src/shared/seo/publicUrlPolicy';
import { ITEM_LIST_LIMIT } from '@/src/seo/structuredData';
import { buildCollectionStructuredData } from '@/shared/entitySeoStructuredData';

const ORIGIN = 'https://hearthpulse.net';
const CATALOG_ROOT = '/standard/cards/';

export type CatalogSearch = Promise<Record<string, string | string[] | undefined>>;
async function catalogSearch(searchParams: CatalogSearch) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  }
  return query.toString();
}
export async function catalogMetadata(format: CardFormat, pathname: string, searchParams: CatalogSearch): Promise<Metadata> {
  const wild = format === 'wild';
  const title = `Карты Hearthstone — ${wild ? 'Вольный формат' : 'Стандарт'} | HearthPulse`;
  const description = wild
    ? 'Все карты Вольного формата Hearthstone: поиск, дополнения, классы, характеристики и статистика карт.'
    : 'Все карты Стандарта Hearthstone: поиск, дополнения, классы, характеристики и статистика карт.';
  const canonical = `https://hearthpulse.net${pathname}`;
  const policy = await resolvePublicUrlPolicy(pathname, await catalogSearch(searchParams));
  return { title, description, alternates: { canonical }, robots: policy.robots, openGraph: { title, description, url: canonical } };
}

export async function CardCatalogPage({ format, pathname, searchParams }: { format: CardFormat; pathname: string; searchParams: CatalogSearch }) {
  const query = await catalogSearch(searchParams);
  const catalog = await loadPublicCatalog(format, query);
  const canonical = `${ORIGIN}${pathname}`;
  // A page that is not indexable (a filtered or paginated copy) prints no graph, like every other page.
  const indexable = (await resolvePublicUrlPolicy(pathname, query)).indexPolicy === 'index';
  // The page shows no breadcrumb, so the steps use its own words: the footer link «Главная», the heading «Карты» and the format switch.
  const breadcrumbs = [
    { name: 'Главная', item: `${ORIGIN}/` },
    { name: 'Карты', item: `${ORIGIN}${CATALOG_ROOT}` },
    // The library root lists the Standard cards under its own canonical URL: it has no format step of its own.
    ...(pathname === CATALOG_ROOT ? [] : [{ name: format === 'wild' ? 'Вольный' : 'Стандарт', item: canonical }]),
  ];
  // The cards of this page, as its grid prints them, at most 100: the list names what the page shows, not the catalog.
  const firstPosition = (catalog.pagination.page - 1) * catalog.pagination.perPage + 1;
  const listed = catalog.cards.slice(0, ITEM_LIST_LIMIT).map((card, index) => ({
    '@type': 'ListItem', position: firstPosition + index, name: card.name.ru, url: `${ORIGIN}${constructedCardPath(format, card.card_id)}/`,
  }));
  const structured = buildCollectionStructuredData({
    canonical, origin: ORIGIN, name: 'Карты Hearthstone', breadcrumbs,
    mainEntity: {
      '@type': 'ItemList', numberOfItems: listed.length, itemListElement: listed,
    },
  });
  return <>
    <PageBannerPreload />
    {indexable && <script type="application/ld+json" data-server-entity-jsonld data-entity-path={pathname}
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, '\\u003c') }} />}
    <LegacyCardPage catalog={catalog} pathname={pathname} initialSearch={query} />
  </>;
}
