import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import '../../../../../src/route-parchment.css';
import '../../../../../src/features/TraditionalModeBanner.css';
import { buildEntityStructuredData } from '../../../../../shared/entitySeoStructuredData';
import { loadPublicBattlegroundHero } from '../../../lib/publicBattlegroundHero';
import { BattlegroundHeroDetailPageClient } from '../../../ui/BattlegroundHeroDetailPageClient';

type Props = { params: Promise<{ dbfId: string }> };
export const dynamic = 'force-dynamic';

async function resolveHero(params: Props['params']) {
  const { dbfId } = await params;
  const hero = await loadPublicBattlegroundHero(dbfId);
  if (!hero) notFound();
  return hero;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const hero = await resolveHero(params);
  const canonical = `https://hearthpulse.net/heroes/${hero.dbfId}/`;
  const title = `${hero.name} — герой Полей сражений | HearthPulse`;
  const description = hero.heroPower?.text
    ? `${hero.name} — герой Полей сражений Hearthstone. Сила героя «${hero.heroPower.name}»: ${hero.heroPower.text}`.slice(0, 300)
    : `${hero.name} — герой режима «Поля сражений» в Hearthstone.`;
  return {
    title, description, alternates: { canonical }, robots: { index: true, follow: true },
    openGraph: { type: 'article', url: canonical, siteName: 'HearthPulse', locale: 'ru_RU',
      title, description, images: [hero.image] },
  };
}

export default async function Page({ params }: Props) {
  const hero = await resolveHero(params);
  const origin = 'https://hearthpulse.net';
  const canonical = `${origin}/heroes/${hero.dbfId}/`;
  const title = `${hero.name} — герой Полей сражений | HearthPulse`;
  const description = hero.heroPower?.text
    ? `${hero.name} — герой Полей сражений Hearthstone. Сила героя «${hero.heroPower.name}»: ${hero.heroPower.text}`.slice(0, 300)
    : `${hero.name} — герой режима «Поля сражений» в Hearthstone.`;
  const structured = buildEntityStructuredData({
    canonical, title, description, origin, image: hero.image, entityFragment: 'hero',
    entity: {
      name: hero.name, identifier: hero.dbfId,
      ...(hero.cardId ? { alternateName: hero.cardId } : {}),
      image: hero.image, description, inLanguage: 'ru',
      isPartOf: { '@type': 'VideoGame', name: 'Hearthstone: Поля сражений' },
      ...(hero.heroPower ? { about: {
        '@type': 'CreativeWork', name: hero.heroPower.name,
        ...(hero.heroPower.text ? { description: hero.heroPower.text } : {}),
        image: hero.heroPower.image,
      } } : {}),
    },
    breadcrumbs: [
      { name: 'Главная', item: `${origin}/` },
      { name: 'Герои Полей сражений', item: `${origin}/heroes/` },
      { name: hero.name, item: canonical },
    ],
  });
  return <>
    <script type="application/ld+json" data-server-entity-jsonld data-entity-path={`/heroes/${hero.dbfId}/`}
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, '\\u003c') }} />
    <BattlegroundHeroDetailPageClient hero={hero} />
  </>;
}
