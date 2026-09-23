import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { constructedCardPath, type CardFormat } from '../../../../../../../src/modules/constructedCards/public';
import { loadPublicCard } from '../../../../../lib/publicCard';
import { LegacyCardPage } from '../../../../../ui/LegacyCardPage';

type Props = { params: Promise<{ format: string; cardId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
export const dynamic = 'force-dynamic';

async function resolveCard() {
  const requestHeaders = await headers();
  const format = requestHeaders.get('x-hearthpulse-card-format') ?? '';
  const cardId = requestHeaders.get('x-hearthpulse-card-id') ?? '';
  if (!['standard', 'wild'].includes(format) || !/^(?:[A-Za-z0-9_]{2,80}|blizzard:[1-9][0-9]{0,18})$/.test(cardId)) notFound();
  const typedFormat = format as CardFormat;
  const card = await loadPublicCard(typedFormat, cardId);
  if (!card) notFound();
  const pathname = constructedCardPath(typedFormat, cardId);
  return { card, format: typedFormat, pathname, canonical: `https://hearthpulse.net${pathname}/` };
}

export async function generateMetadata(): Promise<Metadata> {
  const { card, format, canonical } = await resolveCard();
  const title = `${card.name.ru} — карта Hearthstone (${format === 'standard' ? 'Стандарт' : 'Вольный формат'}, ${card.card_id}) | HearthPulse`;
  const description = card.text.ru || `${card.name.ru} — характеристики карты Hearthstone.`;
  return { title, description, alternates: { canonical }, robots: { index: true, follow: true, 'max-image-preview': 'large' },
    openGraph: { title, description, url: canonical, images: card.images.card ? [card.images.card] : [] } };
}

export default async function CardPage(props: Props) {
  const { card, pathname, canonical } = await resolveCard();
  const query = new URLSearchParams();
  const search = await props.searchParams;
  for (const key of ['period', 'rank', 'statsFormat']) {
    const value = search[key];
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  }
  const structured = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebPage', '@id': canonical, url: canonical, name: card.name.ru, mainEntity: { '@id': `${canonical}#card` } },
    { '@type': 'CreativeWork', '@id': `${canonical}#card`, url: canonical, identifier: card.card_id, name: card.name.ru, description: card.text.ru },
  ] };
  return <>
    <script type="application/ld+json" data-server-entity-jsonld data-entity-path={pathname}
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, '\\u003c') }} />
    <LegacyCardPage card={card} pathname={pathname} initialSearch={query.toString()} />
  </>;
}
