import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import '../../../../../../src/route-parchment.css';
import '../../../../../../src/features/TraditionalModeBanner.css';
import { buildEntityStructuredData } from '../../../../../../shared/entitySeoStructuredData';
import { loadPublicBattlegroundLibraryCard } from '../../../../lib/publicBattlegroundLibraryCard';
import { BattlegroundLibraryDetailPageClient } from '../../../../ui/BattlegroundLibraryDetailPageClient';

type Search = Promise<Record<string, string | string[] | undefined>>;
type Props = { params: Promise<{ kind: string; slugAndDbfId: string }>; searchParams: Search };
export const dynamic = 'force-dynamic';

async function resolveCard({ params, searchParams }: Props) {
  const { kind, slugAndDbfId } = await params;
  const card = await loadPublicBattlegroundLibraryCard(kind, slugAndDbfId);
  if (!card) notFound();
  let requestedSlug: string;
  try { requestedSlug = decodeURIComponent(slugAndDbfId); } catch { notFound(); }
  if (`/library/${kind}/${requestedSlug}/` !== card.canonicalPath) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(await searchParams)) {
      if (Array.isArray(value)) value.forEach(entry => query.append(key, entry));
      else if (value !== undefined) query.set(key, value);
    }
    permanentRedirect(`${encodeURI(card.canonicalPath)}${query.size ? `?${query}` : ''}`);
  }
  return card;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const card = await resolveCard(props);
  const canonical = `https://hearthpulse.net${card.canonicalPath}`;
  const title = `${card.name} — ${card.typeName.toLowerCase()} Полей сражений | HearthPulse`;
  const description = card.text
    ? `${card.name} — ${card.typeName.toLowerCase()} Hearthstone Battlegrounds. ${card.text}`.slice(0, 300)
    : `${card.name} — карта режима «Поля сражений» в Hearthstone.`;
  return {
    title, description, alternates: { canonical }, robots: { index: true, follow: true },
    openGraph: { type: 'article', url: canonical, siteName: 'HearthPulse', locale: 'ru_RU',
      title, description, images: [card.image] },
  };
}

export default async function Page(props: Props) {
  const card = await resolveCard(props);
  const origin = 'https://hearthpulse.net';
  const canonical = new URL(card.canonicalPath, origin).href;
  const title = `${card.name} — ${card.typeName.toLowerCase()} Полей сражений | HearthPulse`;
  const description = card.text
    ? `${card.name} — ${card.typeName.toLowerCase()} Hearthstone Battlegrounds. ${card.text}`.slice(0, 300)
    : `${card.name} — карта режима «Поля сражений» в Hearthstone.`;
  const structured = buildEntityStructuredData({
    canonical, title, description, origin, image: card.image, entityFragment: 'card',
    entity: {
      name: card.name, identifier: card.dbfId, image: card.image, description, inLanguage: 'ru',
      isPartOf: { '@type': 'VideoGame', name: 'Hearthstone: Поля сражений' },
    },
    breadcrumbs: [
      { name: 'Главная', item: `${origin}/` },
      { name: 'Библиотека Полей сражений', item: `${origin}/library/` },
      { name: card.kind === 'minion' ? 'Существа' : 'Заклинания',
        item: `${origin}/library/${card.kind === 'minion' ? 'minions' : 'spells'}/` },
      { name: card.name, item: canonical },
    ],
  });
  return <>
    <script type="application/ld+json" data-server-entity-jsonld data-entity-path={card.canonicalPath}
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, '\\u003c') }} />
    <BattlegroundLibraryDetailPageClient card={card} />
  </>;
}
