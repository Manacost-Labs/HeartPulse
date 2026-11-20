import { memo } from 'react';
import { battlegroundStrategyMetaLine, battlegroundTierCardStats, type BattlegroundTierListKey } from '../modules/battlegrounds/public';
import { optimizedBattlegroundThumbnailUrl } from './battlegroundImageUrls';
import {
  trinketCardImageUrl,
  trinketFullArtUrl,
  trinketMetricView,
  trinketPlacementBars,
  type TrinketView,
} from './battlegroundTrinkets';
import { BattlegroundTrinketTierRow } from './BattlegroundTrinketTierRow';
import {
  bgBuildAnchor,
  bgDetailCardTooltipText,
  bgImageForItem,
  bgItemTitle,
  bgLightboxItem,
  bgRaceLabelForItem,
  bgStrategyPreviewEntries,
  bgThumbnailForItem,
  type BattlegroundLightboxItem,
  type BattlegroundStrategyPreviewEntry,
} from './battlegroundTierListItems';

/** One entry of a Battlegrounds tier list: a strategy with its cards, a trinket row or a minion/spell card. */
function BattlegroundTierCard({ item, list, tier, index, highlighted, onOpen, tourId, trinketView = 'table' }: {
  item: any;
  list: BattlegroundTierListKey;
  tier: string;
  index: number;
  highlighted?: boolean;
  onOpen: (item: BattlegroundLightboxItem) => void;
  tourId?: string;
  trinketView?: TrinketView;
}) {
  const title = bgItemTitle(item);
  if (list === 'strategies') {
    const previewEntries = bgStrategyPreviewEntries(item, tier);
    const previewGroups = previewEntries.reduce<Array<{ key: string; label: string; entries: BattlegroundStrategyPreviewEntry[] }>>((groups, entry) => {
      const existing = groups.find((group) => group.key === entry.groupKey);
      if (existing) {
        existing.entries.push(entry);
        return groups;
      }
      groups.push({ key: entry.groupKey, label: entry.groupLabel, entries: [entry] });
      return groups;
    }, []);
    const meta = battlegroundStrategyMetaLine(item);
    return (
      <article
        id={bgBuildAnchor(item)}
        data-bg-strategy-highlight={highlighted ? 'true' : undefined}
        data-bg-strategy-key={item?.key || undefined}
        data-tour-id={tourId}
        className="bg-tierlist-strategy"
      >
        <h4>{title}</h4>
        {meta && <p className="bg-tierlist-strategy__meta">{meta}</p>}
        {previewGroups.map((group) => (
          <div key={group.key} className="bg-tierlist-strategy__group">
            <p>{group.label}</p>
            <div className="bg-tierlist-strategy__cards">
              {group.entries.map((entry) => (
                <button key={entry.lightbox.key} type="button" onClick={() => onOpen(entry.lightbox)} title={entry.lightbox.title}>
                  <img src={entry.thumb} alt={entry.lightbox.title} width={96} height={128} loading="lazy" decoding="async" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </article>
    );
  }

  const image = bgThumbnailForItem(item, list);
  const lightboxItem = bgLightboxItem(item, list, tier, index);
  if (list === 'trinkets') {
    const metrics = trinketMetricView(item);
    const description = bgDetailCardTooltipText(item?.ruText || item?.localizedText || item?.text || item?.description)
      || 'Описание доступно на изображении аксессуара.';
    return (
      <BattlegroundTrinketTierRow
        title={title}
        raceLabel={bgRaceLabelForItem(item)}
        description={description}
        cost={Number.isFinite(Number(item?.cost)) ? Number(item.cost) : null}
        pickRate={metrics.pickRate}
        averagePlacement={metrics.averagePlacement}
        placementBars={trinketPlacementBars(item?.placementDistribution)}
        fullArt={trinketFullArtUrl(item)}
        cardImage={trinketCardImageUrl(item) || optimizedBattlegroundThumbnailUrl(bgImageForItem(item, list), 384) || image}
        tooltipId={`bg-trinket-tooltip-${String(item?.id || item?.dbfId || 'item').replace(/[^A-Za-z0-9_-]/g, '-')}-${index}`}
        view={trinketView}
        onActivate={() => lightboxItem && onOpen(lightboxItem)}
        tourId={tourId}
      />
    );
  }

  const { primary, secondary } = battlegroundTierCardStats(item, list);
  return (
    <button
      type="button"
      data-tour-id={tourId}
      onClick={() => lightboxItem && onOpen(lightboxItem)}
      className="bg-tierlist-card"
    >
      {image && <img src={image} alt={title} width={160} height={216} loading="lazy" decoding="async" />}
      <span className="bg-tierlist-card__body">
        <strong className="bg-tierlist-card__name">{title}</strong>
        {primary && <span className="bg-tierlist-card__primary"><b>{primary.value}</b> {primary.label}</span>}
        {secondary.length > 0 && <span className="bg-tierlist-card__secondary">
          {secondary.map(entry => <span key={entry.label}>{entry.label} <b>{entry.value}</b></span>)}
        </span>}
      </span>
    </button>
  );
}

export const MemoBattlegroundTierCard = memo(BattlegroundTierCard);
