import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { buildEntityStructuredData } from '@/shared/entitySeoStructuredData';
import { loadPublicBattlegroundHero, loadPublicBattlegroundHeroStats } from '@/apps/public-web/lib/publicBattlegroundHero';
import { heroStatsSummary } from '@/apps/public-web/lib/publicBattlegroundHeroStats';
import { BattlegroundHeroDetailPageClient } from '@/apps/public-web/ui/BattlegroundHeroDetailPageClient';
import { BattlegroundHeroPublicStats } from '@/apps/public-web/ui/BattlegroundHeroPublicStats';
import { isIndexableBattlegroundHero } from '@/shared/battlegroundHeroIndexing';
import { INDEXABLE_ROBOTS, robotsContent } from '@/src/shared/seo/robots';
import { fitMetaDescription } from '@/src/shared/seo/metaDescription';

type Props = { params: Promise<{ dbfId: string }> };
export const dynamic = 'force-dynamic';

async function resolveHero(params: Props['params']) {
  const { dbfId } = await params;
  const hero = await loadPublicBattlegroundHero(dbfId);
  if (!hero) notFound();
  const stats = await loadPublicBattlegroundHeroStats(dbfId);
  // The one indexing rule (shared/seoIndexThreshold.ts): the hero segment of the sitemap judges by the same function.
  const indexable = isIndexableBattlegroundHero(stats?.modes ?? {});
  return { hero, stats, indexable };
}

type Resolved = Awaited<ReturnType<typeof resolveHero>>;

function heroDescription({ hero, stats }: Resolved): string {
  const summary = heroStatsSummary(hero.name, stats);
  return fitMetaDescription(summary
    ? `${summary}${hero.heroPower ? ` Сила героя «${hero.heroPower.name}».` : ''}`
    : hero.heroPower?.text
      ? `${hero.name} — герой Полей сражений Hearthstone. Сила героя «${hero.heroPower.name}»: ${hero.heroPower.text}`
      : `${hero.name} — герой режима «Поля сражений» в Hearthstone: сила героя, арт и описание на HearthPulse.`);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolved = await resolveHero(params);
  const { hero } = resolved;
  const canonical = `https://hearthpulse.net/heroes/${hero.dbfId}/`;
  const title = `${hero.name} — герой Полей сражений | HearthPulse`;
  const description = heroDescription(resolved);
  return {
    title, description, alternates: { canonical },
    robots: resolved.indexable ? INDEXABLE_ROBOTS : robotsContent('noindex-follow'),
    openGraph: { type: 'article', url: canonical, siteName: 'HearthPulse', locale: 'ru_RU',
      title, description, images: [hero.image] },
  };
}

export default async function Page({ params }: Props) {
  const resolved = await resolveHero(params);
  const { hero, stats } = resolved;
  const origin = 'https://hearthpulse.net';
  const canonical = `${origin}/heroes/${hero.dbfId}/`;
  const title = `${hero.name} — герой Полей сражений | HearthPulse`;
  const description = heroDescription(resolved);
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
  if (stats) {
    // The statistics are open for the base range; the closed part is named for crawlers (`isAccessibleForFree: false`).
    (structured['@graph'] as unknown[]).push({
      '@type': 'Dataset',
      '@id': `${canonical}#dataset`,
      name: `Статистика героя ${hero.name} в Полях сражений Hearthstone`,
      description: `Тир, среднее место, доля топ-4, частота выбора и лучшая сборка героя ${hero.name} в рейтинге «Топ 50%» для Соло и Дуо по данным HSReplay. Узкие рейтинговые диапазоны, распределение мест, сборки с метриками и динамика между патчами доступны по подписке.`,
      url: canonical,
      inLanguage: 'ru',
      isAccessibleForFree: false,
      hasPart: { '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: '.paywalled-hero' },
      isBasedOn: [{ '@type': 'Dataset', name: 'HSReplay: Battlegrounds Heroes', url: 'https://hsreplay.net/battlegrounds/heroes/' }],
      variableMeasured: [
        { '@type': 'PropertyValue', name: 'Среднее место героя' },
        { '@type': 'PropertyValue', name: 'Доля топ-4', unitText: '%' },
        { '@type': 'PropertyValue', name: 'Частота выбора героя', unitText: '%' },
      ],
      about: { '@type': 'VideoGame', name: 'Hearthstone' },
    });
  }
  return <>
    {resolved.indexable ? <script type="application/ld+json" data-server-entity-jsonld data-entity-path={`/heroes/${hero.dbfId}/`}
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, '\\u003c') }} /> : null}
    <BattlegroundHeroDetailPageClient hero={hero}
      summary={heroStatsSummary(hero.name, stats) ?? 'Герой режима «Поля сражений» в Hearthstone.'}
      open={<BattlegroundHeroPublicStats stats={stats} heroPower={hero.heroPower} />} />
  </>;
}
