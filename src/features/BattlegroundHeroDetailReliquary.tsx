import { TierBadge } from '../modules/arenaTierList/public';
import { BattlegroundHeroFacts, BattlegroundHeroImage, BattlegroundHeroMediaCard } from './BattlegroundHeroDetailIdentity';
import { bgDetailImageSources } from './battlegroundHeroDetailMedia';
import type { BattlegroundHeroDetailModel } from './battlegroundHeroDetailModel';
import { bgFormatDecimal } from './battlegroundHeroDetailText';
import type { BattlegroundHeroDetailHeroStats, BattlegroundHeroDetailLibraryHero, BattlegroundHeroMediaItem } from './battlegroundHeroDetailTypes';

/** The header of the hero page: portrait, name, facts, the four summary plaques and the hero power and buddy cards. */
export function BattlegroundHeroReliquary({ model, hero, libraryHero, openMediaGallery }: {
  model: BattlegroundHeroDetailModel;
  hero: BattlegroundHeroDetailHeroStats;
  libraryHero: BattlegroundHeroDetailLibraryHero;
  openMediaGallery: (items: BattlegroundHeroMediaItem[], index: number) => void;
}) {
  const { heroName, heroImage, fullArt, patchEntries, externalLinks, heroMediaItems, heroPower, buddy, goldenBuddyCard } = model;
  return (
    <section className="bg-hero-reliquary relative overflow-hidden rounded-[28px] border border-[#d7b66a]/65 bg-[linear-gradient(180deg,#fffef9,#f4ead4)] p-4 shadow-[0_18px_42px_rgba(61,42,30,0.1)] sm:p-5">
      <div
        className="bg-hero-reliquary__art absolute inset-y-0 right-0 hidden w-[58%] opacity-[0.1] lg:block"
        style={{
          backgroundImage: `url(${fullArt})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center right',
          maskImage: 'linear-gradient(90deg, transparent, rgba(0,0,0,1) 30%)',
          WebkitMaskImage: 'linear-gradient(90deg, transparent, rgba(0,0,0,1) 30%)',
        }}
      />
      <div className="bg-hero-reliquary__layout relative grid gap-5 lg:grid-cols-[220px_1fr]">
        <div className="flex justify-center lg:block">
          <div className="bg-hero-reliquary__portrait rounded-[26px] border border-[#d7b66a]/75 bg-[radial-gradient(circle_at_top,#fff7dc,transparent_55%),linear-gradient(180deg,#fffaf0,#eedcba)] p-3 shadow-[0_18px_34px_rgba(61,42,30,0.12)]">
            <BattlegroundHeroImage
              sources={bgDetailImageSources(heroImage)}
              alt={heroName}
              className="w-full max-w-[210px]"
              imgClassName="w-full object-contain drop-shadow-[0_20px_22px_rgba(61,42,30,0.22)]"
            />
          </div>
        </div>
        <div className="bg-hero-reliquary__identity min-w-0">
          <p className="bg-hero-reliquary__kicker font-hs text-xs uppercase tracking-[0.18em]">Поля сражений · герой</p>
          <h1 className="bg-hero-reliquary__title mt-2 font-hs text-4xl leading-tight text-[#3d2a1e] sm:text-5xl">{heroName}</h1>
          <BattlegroundHeroFacts libraryHero={libraryHero} latestPatch={patchEntries.find(entry => entry.changes.some(change => !change.minor))?.version ?? null} links={externalLinks} />
          <div
            className="bg-hero-stat-grid mt-4 grid grid-cols-2 gap-2 xl:grid-cols-4"
            data-tour-id="bg-hero-detail-summary"
          >
            <div className="bg-hero-stat-plaque rounded-2xl border border-[#d7b66a]/65 bg-[#fff8ea]/92 p-3">
              <p className="text-[11px] uppercase">Тир</p>
              <p className="font-hs text-2xl">{hero.tier ? <TierBadge tier={hero.tier} small /> : '—'}</p>
            </div>
            <div className="bg-hero-stat-plaque rounded-2xl border border-[#d7b66a]/65 bg-[#fff8ea]/92 p-3">
              <p className="text-[11px] uppercase">Среднее место</p>
              <p className="font-hs text-2xl">{bgFormatDecimal(hero.avg_placement, 2)}</p>
            </div>
            <div className="bg-hero-stat-plaque rounded-2xl border border-[#bfdbfe] bg-[#dbeafe]/88 p-3">
              <p className="text-[11px] uppercase">Выбор героя</p>
              <p className="font-hs text-2xl">{hero.pick_rate || '—'}</p>
            </div>
            <div className="bg-hero-stat-plaque rounded-2xl border border-[#d7b66a]/65 bg-[#fff8ea]/92 p-3">
              <p className="text-[11px] uppercase">Лучший состав</p>
              <p className="font-hs text-xl">{hero.best_composition || '—'}</p>
            </div>
          </div>
          {heroMediaItems.length > 0 && (
            <div
              className="bg-hero-media-grid mt-4"
              data-tour-id="bg-hero-detail-media"
            >
              {heroPower && <BattlegroundHeroMediaCard title="Сила героя" card={heroPower} onOpen={() => openMediaGallery(heroMediaItems, 0)} />}
              {buddy && <BattlegroundHeroMediaCard title="Компаньон" card={buddy} onOpen={() => openMediaGallery(heroMediaItems, heroPower ? 1 : 0)} />}
              {goldenBuddyCard && (
                <BattlegroundHeroMediaCard
                  title="Золотой компаньон"
                  card={goldenBuddyCard}
                  tone="gold"
                  onOpen={() => openMediaGallery(heroMediaItems, heroPower && buddy ? 2 : heroPower || buddy ? 1 : 0)}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
