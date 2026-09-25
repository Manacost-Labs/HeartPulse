import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import '../../../../../../src/route-parchment.css';
import '../../../../../../src/features/TraditionalModeBanner.css';
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
  return <BattlegroundLibraryDetailPageClient card={await resolveCard(props)} />;
}
