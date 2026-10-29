import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { constructedCardPath, type CardFormat, type PublicCardSeed } from '@/src/modules/constructedCards/public';
import { buildEntityStructuredData } from '@/shared/entitySeoStructuredData';
import { sameOriginPublicResourceUrl } from '@/shared/publicResourceUrl';
import { loadPublicCard } from '@/apps/public-web/lib/publicCard';
import { LegacyCardDetailPage } from '@/apps/public-web/ui/LegacyCardDetailPage';
import { INDEXABLE_ROBOTS } from '@/src/shared/seo/robots';
import { fitMetaDescription } from '@/src/shared/seo/metaDescription';

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

function cardTitle(card: PublicCardSeed, format: CardFormat): string {
  return `${card.name.ru} — карта Hearthstone (${FORMAT_NAMES[format]}, ${card.card_id}) | HearthPulse`;
}

function cardDescription(card: PublicCardSeed, format: CardFormat): string {
  const formatName = format === 'standard' ? 'Стандарте' : 'Вольном формате';
  return fitMetaDescription(card.text.ru
    ? `${card.name.ru}: ${card.text.ru.trim()}${/[.!?…]$/.test(card.text.ru.trim()) ? '' : '.'} Статистика и колоды с картой в ${formatName} на HearthPulse.`
    : `${card.name.ru} — характеристики, статистика и колоды с картой Hearthstone в ${formatName}.`);
}

export async function generateMetadata(): Promise<Metadata> {
  const { card, format, canonical } = await resolveCard();
  const title = cardTitle(card, format);
  const description = cardDescription(card, format);
  return { title, description, alternates: { canonical }, robots: INDEXABLE_ROBOTS,
    openGraph: { title, description, url: canonical, images: card.images.card ? [card.images.card] : [] } };
}

/** The card facts that reach the anonymous page; the class is not among them, the seed carries only its code. */
function cardProperties(card: PublicCardSeed, format: CardFormat) {
  const facts: Array<[string, string | number | null]> = [
    ['Формат', FORMAT_NAMES[format]],
    ['Мана', card.mana_cost],
    ['Тип', card.card_type.name_ru],
    ['Редкость', card.rarity],
    ['Дополнение', card.card_set],
    ['Атака', card.attack],
    ['Здоровье', card.health],
    ['Прочность', card.durability],
    ['Броня', card.armor],
  ];
  return facts.flatMap(([name, value]) => value === null ? [] : [{ '@type': 'PropertyValue', name, value }]);
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
      additionalProperty: cardProperties(card, format),
    },
    // The words and the link of the breadcrumb the page itself shows (`StandardCardDetail`); the format step has no link there.
    breadcrumbs: [
      { name: 'Карты', item: `${ORIGIN}/standard/cards/${format}/` },
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
