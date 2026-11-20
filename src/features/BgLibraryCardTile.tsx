import React, { useState } from 'react';
import { TierBadge } from '../modules/arenaTierList/public';
import { publicResourceImageUrl } from '../publicResourceUrl';
import { visibleEnglishLibraryName } from './bgLibraryCatalogModel';
import { cardLibraryKind, cardPath, cardRuName, isTierLetter, libraryTierLabel, libraryTierValue, type LibraryCard } from './bgLibraryCards';
import { fallbackBrokenHeroImage, fallbackCardImages, goldenCardImage, hideBrokenImage, primaryCardImage, uniqueStrings } from './bgLibraryCardImages';
import { isBaseLibraryKind, libraryKindLabel, type PoolMode } from './bgLibrarySections';

/** One card of a library listing: its picture (the golden version on hover), names and badges, a link to its page. */
export const LibraryCardTile = React.memo(function LibraryCardTile({
  card,
  pool,
  navigatePath,
  tourId,
}: {
  key?: React.Key;
  card: LibraryCard;
  pool: PoolMode;
  navigatePath: (path: string) => void;
  tourId?: string;
}) {
  const [showGolden, setShowGolden] = useState(false);
  const href = cardPath(card, pool);
  const originalImage = primaryCardImage(card) || '/arena-logo-icon.webp?v=arena-legacy-20260629';
  // Tiles are at most 240 CSS pixels wide; keep 2x detail without transferring full PNGs.
  const image = publicResourceImageUrl(originalImage, { width: 480 });
  const fallbacks = uniqueStrings([
    image !== originalImage ? originalImage : null,
    ...fallbackCardImages(card, originalImage, false),
  ]);
  const golden = goldenCardImage(card);
  const cardKind = cardLibraryKind(card);
  const englishName = visibleEnglishLibraryName(card, cardRuName(card));
  return (
    <a
      href={href}
      onClick={(event) => { event.preventDefault(); navigatePath(href); }}
      data-library-card-tile
      onPointerEnter={event => { if (event.pointerType === 'mouse') setShowGolden(true); }}
      onFocus={() => setShowGolden(true)}
      data-tour-id={tourId}
      className="bg-library-card-tile group relative block overflow-visible rounded-md p-1 text-center transition-transform hover:-translate-y-1"
      style={{ textDecoration: 'none' }}
    >
      <div className="relative mx-auto aspect-[0.72] w-full max-w-[240px]">
        <img
          src={image}
          alt={cardRuName(card)}
          className="relative z-10 h-full w-full object-contain drop-shadow-[0_16px_20px_rgba(21,31,47,0.22)] transition duration-(--motion-base) group-hover:scale-[1.03] sm:group-hover:-translate-x-5"
          loading="lazy"
          decoding="async"
          data-fallbacks={fallbacks.join('|') || undefined}
          onError={fallbackBrokenHeroImage}
        />
        {golden && showGolden && (
          <img
            src={golden}
            alt={`${cardRuName(card)}, золотая версия`}
            className="bg-library-golden-image pointer-events-none absolute inset-0 z-20 h-full w-full translate-x-2 object-contain opacity-0 drop-shadow-[0_20px_26px_rgba(21,31,47,0.28)] transition duration-(--motion-base) group-hover:translate-x-8 group-hover:opacity-100 sm:group-hover:translate-x-12"
            loading="eager"
            decoding="async"
            onError={hideBrokenImage}
          />
        )}
      </div>
      <div className="bg-library-card-caption mx-auto mt-2 max-w-[220px] px-2 py-1">
        <p className="line-clamp-2 font-hs text-sm leading-tight text-[#26374f]">{cardRuName(card)}</p>
        {englishName && <p lang="en" className="mt-1 line-clamp-2 text-xs leading-tight text-[#657893]">{englishName}</p>}
        <div className="mt-1 flex flex-wrap justify-center gap-1">
          {cardKind === 'darkmoon_prize' && libraryTierValue(card) && (isTierLetter(libraryTierValue(card))
            ? <TierBadge tier={libraryTierValue(card)} small />
            : <span className="rounded bg-[#f3e8ff] px-1.5 py-0.5 text-[11px] font-bold text-[#6d28d9]">{libraryTierLabel(card)}</span>)}
          {card.tavern_tier && cardKind !== 'minion' && <span className="rounded bg-[#fff3c4] px-1.5 py-0.5 text-[11px] font-bold text-[#7c5b24]">Т{card.tavern_tier}</span>}
          {!isBaseLibraryKind(cardKind) && <span className="rounded bg-[#eef4fd] px-1.5 py-0.5 text-[11px] font-bold text-[#4f6685]">{libraryKindLabel(cardKind)}</span>}
          {card.group?.name_ru && <span className="max-w-full truncate rounded bg-[#f6ead0] px-1.5 py-0.5 text-[11px] font-bold text-[#7c5b24]">{card.group.name_ru}</span>}
        </div>
      </div>
      <span className="sr-only">Открыть страницу карты {cardRuName(card)}</span>
    </a>
  );
});
