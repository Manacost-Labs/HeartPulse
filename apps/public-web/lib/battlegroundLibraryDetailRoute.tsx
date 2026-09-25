import 'server-only';
import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { buildEntityStructuredData } from '../../../shared/entitySeoStructuredData';
import { loadPublicBattlegroundLibraryCard } from './publicBattlegroundLibraryCard';
import type { BattlegroundLibraryPool } from './battlegroundLibraryDetailKinds';
import { BattlegroundLibraryDetailPageClient } from '../ui/BattlegroundLibraryDetailPageClient';

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

function seo(card: NonNullable<Awaited<ReturnType<typeof loadPublicBattlegroundLibraryCard>>>, pool: BattlegroundLibraryPool) {
  const origin = 'https://hearthpulse.net';
  const canonical = new URL(card.canonicalPath, origin).href;
  const title = pool === 'archive'
    ? `${card.name} — архивная ${card.typeName.toLowerCase()} Полей сражений | HearthPulse`
    : `${card.name} — ${card.typeName.toLowerCase()} Полей сражений | HearthPulse`;
  const description = pool === 'archive'
    ? `${card.name} — архивная карта Полей сражений Hearthstone. ${card.text ?? ''}`.slice(0, 300)
    : card.text
      ? `${card.name} — ${card.typeName.toLowerCase()} Hearthstone Battlegrounds. ${card.text}`.slice(0, 300)
      : `${card.name} — карта режима «Поля сражений» в Hearthstone.`;
  return { origin, canonical, title, description };
}

export async function battlegroundDetailMetadata(props: BattlegroundDetailProps,
  pool: BattlegroundLibraryPool): Promise<Metadata> {
  const card = await resolveCard(props, pool);
  const { canonical, title, description } = seo(card, pool);
  return {
    title, description, alternates: { canonical }, robots: { index: true, follow: true },
    openGraph: { type: 'article', url: canonical, siteName: 'HearthPulse', locale: 'ru_RU',
      title, description, images: [card.image] },
  };
}

export async function battlegroundDetailPage(props: BattlegroundDetailProps,
  pool: BattlegroundLibraryPool) {
  const card = await resolveCard(props, pool);
  const { origin, canonical, title, description } = seo(card, pool);
  const kind = (await props.params).kind;
  const prefix = pool === 'archive' ? '/library/archive' : '/library';
  const kindLabel = kind === 'minions' ? 'Существа' : kind === 'spells' ? 'Заклинания' : card.typeName;
  const structured = buildEntityStructuredData({
    canonical, title, description, origin, image: card.image, entityFragment: 'card',
    entity: {
      name: card.name, identifier: card.dbfId, image: card.image, description, inLanguage: 'ru',
      isPartOf: { '@type': 'VideoGame', name: 'Hearthstone: Поля сражений' },
    },
    breadcrumbs: [
      { name: 'Главная', item: `${origin}/` },
      { name: 'Библиотека Полей сражений', item: `${origin}/library/` },
      ...(pool === 'archive' ? [{ name: 'Архив', item: `${origin}/library/archive/` }] : []),
      { name: kindLabel, item: `${origin}${prefix}/${kind}/` },
      { name: card.name, item: canonical },
    ],
  });
  return <>
    <script type="application/ld+json" data-server-entity-jsonld data-entity-path={card.canonicalPath}
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, '\\u003c') }} />
    <BattlegroundLibraryDetailPageClient card={card} />
  </>;
}
