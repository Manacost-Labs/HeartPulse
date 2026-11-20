import { useCallback, useState, type ReactNode } from 'react';
// The hero page's look lives with the Battlegrounds styles: the open page renders the view without the paid chunk.
import '../modules/battlegrounds/public.css';
import '../route-parchment.css';
import './Battlegrounds.css';
import '../battlegrounds-shell.css';
import '../battlegrounds-parchment.css';
import { ChevronLeft } from 'lucide-react';
import type { HeroAnalyticsCard } from '../modules/battlegrounds/public';
import { CardPatchTimeline } from './CardPatchTimeline';
import { BattlegroundHeroGallery } from './BattlegroundHeroDetailGallery';
import { BattlegroundHeroImage, BattlegroundHeroProfileInfo } from './BattlegroundHeroDetailIdentity';
import { bgDetailImageSources, bgHeroSkinLargeImage } from './battlegroundHeroDetailMedia';
import { bgHeroDetailModel } from './battlegroundHeroDetailModel';
import { BattlegroundHeroReliquary } from './BattlegroundHeroDetailReliquary';
import { BG_HERO_PATCH_KIND_LABELS } from './battlegroundHeroDetailText';
import type {
  BattlegroundHeroDetailHeroStats,
  BattlegroundHeroDetailLibraryHero,
  BattlegroundHeroDetailStats,
  BattlegroundHeroMediaItem,
  BattlegroundHeroSkin,
} from './battlegroundHeroDetailTypes';

/** What the statistics block is drawn from: the payload, its hero row and the cards of its compositions. */
export type BattlegroundHeroStatisticsInput = {
  stats: BattlegroundHeroDetailStats;
  hero: BattlegroundHeroDetailHeroStats;
  analyticsCards: Record<string, HeroAnalyticsCard>;
};
import { BattlegroundHeroMediaLightbox } from './BattlegroundHeroDetailLightbox';


function BattlegroundHeroSkins({ heroName, skins, skinMediaItems, openMediaGallery }: {
  heroName: string;
  skins: BattlegroundHeroSkin[];
  skinMediaItems: BattlegroundHeroMediaItem[];
  openMediaGallery: (items: BattlegroundHeroMediaItem[], index: number) => void;
}) {
  return (
    <section className="bg-hero-ledger-panel bg-hero-section" aria-labelledby="hero-skins-title">
      <header className="bg-hero-section__heading">
        <p className="bg-hero-section__eyebrow">Коллекция</p>
        <h2 id="hero-skins-title">Скины героя</h2>
      </header>
      <div className="bg-hero-skins grid grid-cols-2 gap-3 lg:grid-cols-4">
        {skins.map((skin, index) => (
          <button
            key={skin.card_id || skin.image}
            type="button"
            onClick={() => openMediaGallery(skinMediaItems, index)}
            className="group rounded-2xl border border-[#e2cf99] bg-[#fff9ed] p-3 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_24px_rgba(61,42,30,0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b58a2f]"
          >
            <BattlegroundHeroImage
              sources={bgDetailImageSources(skin.image, bgHeroSkinLargeImage(skin.image))}
              alt={skin.title && skin.title !== heroName ? `${heroName} — ${skin.title}` : `${heroName} — скин героя`}
              className="mx-auto w-full"
              imgClassName="mx-auto h-40 w-full object-contain drop-shadow-[0_12px_16px_rgba(61,42,30,0.16)] transition-transform duration-200 group-hover:scale-[1.02]"
            />
            <p className="mt-2 min-h-[2.4rem] text-sm font-bold leading-tight text-[#3d2a1e]">{skin.title || skin.card_id || 'Скин героя'}</p>
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * The hero detail page over an already loaded payload: no requests and no document meta,
 * so the same markup can be rendered from open data on the server. `statistics` draws the statistics block
 * (the subscriber's analytics, or the open figures with locks), so the analytics code stays out of the open page.
 */
export function BattlegroundHeroDetailView({ dbfId, stats, libraryHero: loadedLibraryHero, cards, onNavigate, statistics }: {
  dbfId: string;
  stats: BattlegroundHeroDetailStats;
  libraryHero?: BattlegroundHeroDetailLibraryHero | null;
  cards?: Record<string, HeroAnalyticsCard> | null;
  onNavigate: (path: string) => void;
  statistics: (input: BattlegroundHeroStatisticsInput) => ReactNode;
}) {
  const [lightboxItems, setLightboxItems] = useState<BattlegroundHeroMediaItem[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const openMediaGallery = useCallback((items: BattlegroundHeroMediaItem[], index: number) => {
    if (!items.length) return;
    setLightboxItems(items);
    setLightboxIndex(index);
  }, []);
  const closeLightbox = useCallback(() => setLightboxIndex(-1), []);

  const hero: BattlegroundHeroDetailHeroStats = stats.hero || {};
  const libraryHero: BattlegroundHeroDetailLibraryHero = loadedLibraryHero || {};
  const model = bgHeroDetailModel(dbfId, hero, libraryHero, cards || {});
  const { heroName, patchEntries, skins, skinMediaItems, galleryMediaItems, buddySoundGroups, analyticsCards } = model;

  return (
    <div className="bg-hero-detail-page space-y-6 text-[#3d2a1e]">
      <button type="button" onClick={() => onNavigate('/heroes')} className="inline-flex items-center gap-2 rounded-md border border-[#d7b66a]/70 bg-[#fff7e6]/80 px-3 py-2 text-sm font-bold text-[#3d2a1e] transition-colors hover:bg-[#fff3c4]">
        <ChevronLeft className="h-4 w-4" /> Все герои
      </button>
      <BattlegroundHeroReliquary model={model} hero={hero} libraryHero={libraryHero} openMediaGallery={openMediaGallery} />

      <BattlegroundHeroProfileInfo heroName={heroName} libraryHero={libraryHero} />

      {statistics({ stats, hero, analyticsCards })}

      {patchEntries.length > 0 && (
        <section id="hero-patches" className="bg-hero-ledger-panel bg-hero-section" aria-labelledby="hero-patches-title">
          <header className="bg-hero-section__heading" data-tour-id="bg-hero-detail-patches">
            <p className="bg-hero-section__eyebrow">История баланса</p>
            <h2 id="hero-patches-title">Изменения по патчам</h2>
          </header>
          <CardPatchTimeline entries={patchEntries} kindLabels={BG_HERO_PATCH_KIND_LABELS} limit={5} />
        </section>
      )}

      {skins.length > 0 && (
        <BattlegroundHeroSkins heroName={heroName} skins={skins} skinMediaItems={skinMediaItems} openMediaGallery={openMediaGallery} />
      )}

      <BattlegroundHeroGallery
        heroName={heroName}
        items={galleryMediaItems}
        soundGroups={buddySoundGroups}
        onOpen={index => openMediaGallery(galleryMediaItems, index)}
        tourId="bg-hero-detail-gallery"
      />

      {lightboxIndex >= 0 && (
        <BattlegroundHeroMediaLightbox
          items={lightboxItems}
          index={lightboxIndex}
          onClose={closeLightbox}
          onIndexChange={setLightboxIndex}
        />
      )}
    </div>
  );
}
