import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { constructedCardPath, type CardFormat, type PublicCardSeed } from '@/src/modules/constructedCards/public';
import { buildEntityStructuredData } from '@/shared/entitySeoStructuredData';
import { sameOriginPublicResourceUrl } from '@/shared/publicResourceUrl';
import { loadPublicCard } from '@/apps/public-web/lib/publicCard';
import { LegacyCardDetailPage } from '@/apps/public-web/ui/LegacyCardDetailPage';
import { INDEXABLE_ROBOTS } from '@/src/shared/seo/robots';
import { constructedCardDescription, constructedCardTitle } from '@/shared/entityPageTitles';

type Props = { params: Promise<{ format: string; cardId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
export const dynamic = 'force-dynamic';

const ORIGIN = 'https://hearthpulse.net';
const FORMAT_NAMES: Record<CardFormat, string> = { standard: 'Стандарт', wild: 'Вольный формат' };

async function resolveCard() {
  const requestHeaders = await headers();
  const format = requestHeaders.get('x-hearthpulse-card-format') ?? '';
  const cardId = requestHeaders.get('x-hearthpulse-card-id') ?? '';
  if (!['standard', 'wild'].includes(format) || !/^(?:[A-Za-z0-9_]{2,80}|blizzard:[1-9][0-9]{0,18})$/.test(cardId)) notFound();
  const typedFormat = format as CardFormat;
  const card = await loadPublicCard(typedFormat, cardId);
  if (!card) notFound();
  const pathname = constructedCardPath(typedFormat, cardId);
  return { card, format: typedFormat, pathname, canonical: `${ORIGIN}${pathname}/` };
}

/** The open facts the title and the description name; the same call as Express and the browser make. */
function cardFacts(card: PublicCardSeed, format: CardFormat) {
  return {
    name: card.name.ru, id: card.card_id, format, rulesText: card.text.ru, set: card.card_set, classCode: card.class,
    type: card.card_type.name_ru, rarity: card.rarity, mana: card.mana_cost, attack: card.attack, health: card.health,
    durability: card.durability,
  };
}

function cardTitle(card: PublicCardSeed, format: CardFormat): string {
  return constructedCardTitle(cardFacts(card, format));
}

function cardDescription(card: PublicCardSeed, format: CardFormat): string {
  return constructedCardDescription(cardFacts(card, format));
}

export async function generateMetadata(): Promise<Metadata> {
  const { card, format, canonical } = await resolveCard();
  const title = cardTitle(card, format);
  const description = cardDescription(card, format);
  return { title, description, alternates: { canonical }, robots: INDEXABLE_ROBOTS,
    openGraph: { title, description, url: canonical, images: card.images.card ? [card.images.card] : [] } };
}

/**
 * The card facts as `keywords`: schema.org defines `additionalProperty` for
 * products and places, not for a `CreativeWork`, so validators flag it there.
 */
function cardKeywords(card: PublicCardSeed, format: CardFormat): string {
  const facts = [
    'Hearthstone', FORMAT_NAMES[format], card.card_type.name_ru, card.rarity, card.card_set,
  ];
  return facts.filter((fact): fact is string => Boolean(fact)).join(', ');
}

export default async function CardPage(props: Props) {
  const { card, format, pathname, canonical } = await resolveCard();
  const query = new URLSearchParams();
  const search = await props.searchParams;
  for (const key of ['period', 'rank', 'statsFormat']) {
    const value = search[key];
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  }
  const title = cardTitle(card, format);
  const description = cardDescription(card, format);
  const image = sameOriginPublicResourceUrl(card.images.card, ORIGIN);
  const structured = buildEntityStructuredData({
    canonical, title, description, origin: ORIGIN, image, entityFragment: 'card',
    entity: {
      name: card.name.ru,
      ...(card.name.en ? { alternateName: card.name.en } : {}),
      identifier: card.card_id,
      ...(image ? { image } : {}),
      description, inLanguage: 'ru',
      isPartOf: { '@type': 'VideoGame', name: 'Hearthstone' },
      keywords: cardKeywords(card, format),
    },
    // The words and the links of the breadcrumb the page itself shows (`StandardCardDetail`).
    breadcrumbs: [
      { name: 'Карты', item: `${ORIGIN}/standard/cards/` },
      { name: format === 'standard' ? 'Стандарт' : 'Вольный', item: `${ORIGIN}/standard/cards/${format}/` },
      { name: card.name.ru, item: canonical },
    ],
  });
  return <>
    <script type="application/ld+json" data-server-entity-jsonld data-entity-path={pathname}
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, '\\u003c') }} />
    <LegacyCardDetailPage card={card} pathname={pathname} initialSearch={query.toString()} />
  </>;
}
