import { memo, useState } from 'react';
import { publicResourceUrl } from '../publicResourceUrl';

interface HeroCardData {
  name: string;
  image: string;
  dbfId?: number;
  averagePlace?: string;
  popularity?: string;
  heroPower?: { name: string; image?: string | null; imageGold?: string | null; cropImage?: string | null } | null;
}

export const BattlegroundHeroCard = memo(function BattlegroundHeroCard({ hero, tier, onNavigate, tourId }: {
  hero: HeroCardData;
  tier: string;
  onNavigate: (path: string) => void;
  tourId?: string;
}) {
  const [previewDismissed, setPreviewDismissed] = useState(false);
  const powerImage = hero.heroPower?.image || hero.heroPower?.imageGold || hero.heroPower?.cropImage;
  const href = hero.dbfId ? `/heroes/${hero.dbfId}` : '/heroes';
  return (
    <a
      href={href}
      onClick={event => {
        if (!hero.dbfId || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        onNavigate(href);
      }}
      onMouseEnter={() => setPreviewDismissed(false)}
      onFocus={() => setPreviewDismissed(false)}
      onKeyDown={event => { if (event.key === 'Escape') setPreviewDismissed(true); }}
      data-has-related={powerImage ? 'true' : 'false'}
      data-preview-dismissed={previewDismissed ? 'true' : 'false'}
      data-tour-id={tourId}
      className="battleground-hero-card relative flex min-h-[252px] flex-col items-center overflow-visible rounded-lg p-3 text-center hover:z-30 focus:z-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d7b66a]"
    >
      <div className="relative flex w-full justify-center overflow-visible">
        <img
          src={publicResourceUrl(hero.image)} alt={hero.name} loading="lazy" decoding="async"
          className="battleground-hero-main aspect-[3/4] w-full max-w-[184px] object-contain drop-shadow-[0_7px_14px_rgba(0,0,0,0.38)]"
        />
        {powerImage && (
          <div className="battleground-hero-related-card absolute right-1 top-0 z-20 w-[136px] drop-shadow-[0_18px_22px_rgba(36,24,10,0.35)] sm:right-2 sm:w-[156px] xl:w-[174px]">
            <img src={publicResourceUrl(powerImage)} alt={`Сила героя: ${hero.heroPower?.name}`} loading="lazy" decoding="async" className="w-full object-contain" />
          </div>
        )}
      </div>
      <h4 className="mt-2 min-h-[2.2rem] font-hs text-sm leading-tight text-[#3d2a1e]">{hero.name}</h4>
      <div className="mt-2 flex flex-wrap justify-center gap-1.5">
        <span className="rounded-md border border-[#d7b66a]/70 bg-[#fff3c4] px-2.5 py-1 font-hs text-sm leading-none text-[#3d2a1e] shadow-sm">{hero.averagePlace || '—'}</span>
        {hero.popularity && <span className="rounded-md border border-[#bfdbfe] bg-[#dbeafe] px-2.5 py-1 text-xs font-bold leading-none text-[#1e3a8a] shadow-sm">{hero.popularity}</span>}
      </div>
      {hero.heroPower && <span className="sr-only">Сила героя: {hero.heroPower.name}.{tier ? ` Тир ${tier}.` : ''}</span>}
    </a>
  );
});
