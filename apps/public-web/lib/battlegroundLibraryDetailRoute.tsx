import 'server-only';
import { battlegroundCardTitle } from '@/shared/entityPageTitles';
import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { buildEntityStructuredData } from '@/shared/entitySeoStructuredData';
import { loadPublicBattlegroundLibraryCard } from './publicBattlegroundLibraryCard';
import { libraryCardIndexingFacts, type PublicBattlegroundLibraryCard } from './publicBattlegroundLibraryCardData';
import { libraryCardDescription, libraryCardSummary } from './battlegroundLibraryCardText';
import type { BattlegroundLibraryPool } from './battlegroundLibraryDetailKinds';
import { BattlegroundLibraryDetailPageClient } from '@/apps/public-web/ui/BattlegroundLibraryDetailPageClient';
import { BattlegroundLibraryPublicCard } from '@/apps/public-web/ui/BattlegroundLibraryPublicCard';
import { isIndexableBattlegroundLibraryCard } from '@/shared/battlegroundLibraryIndexing';
import { INDEXABLE_ROBOTS, robotsContent } from '@/src/shared/seo/robots';

type Search = Promise<Record<string, string | string[] | undefined>>;
export type BattlegroundDetailProps = {
  params: Promise<{ kind: string; slugAndDbfId: string }>;
  searchParams: Search;
};

async function resolveCard({ params, searchParams }: BattlegroundDetailProps, pool: BattlegroundLibraryPool) {
  const { kind, slugAndDbfId } = await params;
  const card = await loadPublicBattlegroundLibraryCard(kind, slugAndDbfId, pool);
  if (!card) notFound();
  let requestedSlug: string;
  try { requestedSlug = decodeURIComponent(slugAndDbfId); } catch { notFound(); }
  const prefix = pool === 'archive' ? '/library/archive' : '/library';
  if (`${prefix}/${kind}/${requestedSlug}/` !== card.canonicalPath) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(await searchParams)) {
      if (Array.isArray(value)) value.forEach(entry => query.append(key, entry));
      else if (value !== undefined) query.set(key, value);
    }
    permanentRedirect(`${encodeURI(card.canonicalPath)}${query.size ? `?${query}` : ''}`);
  }
  return card;
}

/** The one indexing rule (shared/seoIndexThreshold.ts): the minion segment of the sitemap judges by the same function. */
const isIndexable = (card: PublicBattlegroundLibraryCard) => isIndexableBattlegroundLibraryCard(libraryCardIndexingFacts(card));

function seo(card: PublicBattlegroundLibraryCard, pool: BattlegroundLibraryPool) {
  const origin = 'https://hearthpulse.net';
  const canonical = new URL(card.canonicalPath, origin).href;
  const title = battlegroundCardTitle({ name: card.name, type: card.typeName, archive: pool === 'archive' });
  return { origin, canonical, title, description: libraryCardDescription(card, pool === 'archive') };
}

/** The trail of a card page: the JSON-LD BreadcrumbList and the visible one are this one list. */
function crumbs(card: PublicBattlegroundLibraryCard, pool: BattlegroundLibraryPool, kind: string) {
  const prefix = pool === 'archive' ? '/library/archive' : '/library';
  const kindLabel = kind === 'minions' ? 'Существа' : kind === 'spells' ? 'Заклинания' : card.typeName;
  return [
    { name: 'Главная', href: '/' },
    { name: 'Библиотека Полей сражений', href: '/library/' },
    ...(pool === 'archive' ? [{ name: 'Архив', href: '/library/archive/' }] : []),
    { name: kindLabel, href: `${prefix}/${kind}/` },
    { name: card.name, href: card.canonicalPath },
  ];
}

export async function battlegroundDetailMetadata(props: BattlegroundDetailProps,
  pool: BattlegroundLibraryPool): Promise<Metadata> {
  const card = await resolveCard(props, pool);
  const { canonical, title, description } = seo(card, pool);
  return {
    title, description, alternates: { canonical }, robots: isIndexable(card) ? INDEXABLE_ROBOTS : robotsContent('noindex-follow'),
    openGraph: { type: 'article', url: canonical, siteName: 'HearthPulse', locale: 'ru_RU',
      title, description, images: [card.image] },
  };
}

export async function battlegroundDetailPage(props: BattlegroundDetailProps,
  pool: BattlegroundLibraryPool) {
  const card = await resolveCard(props, pool);
  const { origin, canonical, title, description } = seo(card, pool);
  const trail = crumbs(card, pool, (await props.params).kind);
  const structured = buildEntityStructuredData({
    canonical, title, description, origin, image: card.image, entityFragment: 'card',
    entity: {
      name: card.name, identifier: card.dbfId, image: card.image, description, inLanguage: 'ru',
      isPartOf: { '@type': 'VideoGame', name: 'Hearthstone: Поля сражений' },
    },
    breadcrumbs: trail.map(crumb => ({ name: crumb.name, item: new URL(crumb.href, origin).href })),
  });
  if (card.stats) {
    // The statistics are open for the base slice; the closed part is named for crawlers (`isAccessibleForFree: false`).
    (structured['@graph'] as unknown[]).push({
      '@type': 'Dataset',
      '@id': `${canonical}#dataset`,
      name: `Статистика ${card.name} в Полях сражений Hearthstone`,
      description: `Среднее место с существом ${card.name} и без него, популярность и число игр в рейтинге «Топ 50%» текущего патча по данным HSReplay. Сила по ходам, покупки, позиции на столе и история доступны по подписке.`,
      url: canonical,
      inLanguage: 'ru',
      isAccessibleForFree: false,
      hasPart: { '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: '.paywalled-library-card' },
      isBasedOn: [{ '@type': 'Dataset', name: 'HSReplay: Battlegrounds Minions', url: 'https://hsreplay.net/battlegrounds/minions/' }],
      variableMeasured: [
        { '@type': 'PropertyValue', name: 'Среднее место с существом' },
        { '@type': 'PropertyValue', name: 'Популярность', unitText: '%' },
      ],
      about: { '@type': 'VideoGame', name: 'Hearthstone' },
    });
  }
  return <>
    {isIndexable(card) ? <script type="application/ld+json" data-server-entity-jsonld data-entity-path={card.canonicalPath}
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, '\\u003c') }} /> : null}
    <BattlegroundLibraryDetailPageClient card={card} summary={libraryCardSummary(card)}
      open={<BattlegroundLibraryPublicCard card={card} />} crumbs={trail} />
  </>;
}
