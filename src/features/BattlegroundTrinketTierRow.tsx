import { useCallback, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { TrinketView } from './battlegroundTrinkets';
import { BattlegroundTrinketGalleryStats } from './BattlegroundTrinketGalleryStats';

type TrinketTooltipPosition = { left: number; top: number; width: number };

export type TrinketTierRowPlacementBar = {
  place: number;
  rate: number;
  height: number;
};

export type TrinketTierRowProps = {
  title: string;
  raceLabel: string;
  description: string;
  cost: number | null;
  pickRate: string;
  averagePlacement: string;
  pickRateValue: number;
  placementQuality: number;
  placementBars: TrinketTierRowPlacementBar[];
  fullArt: string;
  cardImage: string;
  tooltipId: string;
  view: TrinketView;
  onActivate: () => void;
  tourId?: string;
};

function tooltipPosition(element: HTMLElement): TrinketTooltipPosition {
  const rect = element.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.min(360, Math.max(280, viewportWidth - 24));
  const height = Math.min(width * 1.516, viewportHeight - 24);
  const preferredLeft = rect.right + 12;
  const left = preferredLeft + width <= viewportWidth - 12
    ? preferredLeft
    : Math.min(viewportWidth - width - 12, Math.max(12, rect.left + 24));
  const top = Math.max(12, Math.min(rect.top + rect.height / 2 - height / 2, viewportHeight - height - 12));
  return { left, top, width };
}

/** Complete trinket statistic row with a non-interactive hover/focus preview. */
export function BattlegroundTrinketTierRow({
  title,
  raceLabel,
  description,
  cost,
  pickRate,
  averagePlacement,
  pickRateValue,
  placementQuality,
  placementBars,
  fullArt,
  cardImage,
  tooltipId,
  view,
  onActivate,
  tourId,
}: TrinketTierRowProps) {
  const [tooltip, setTooltip] = useState<TrinketTooltipPosition | null>(null);
  const showTooltip = useCallback((element: HTMLElement) => setTooltip(tooltipPosition(element)), []);

  const tooltipPreview = tooltip && cardImage ? createPortal(
    <aside
      id={tooltipId}
      role="tooltip"
      className="bg-trinket-hover-tooltip"
      style={{ left: tooltip.left, top: tooltip.top, width: tooltip.width }}
    >
      <img
        src={cardImage}
        alt=""
        width={360}
        height={546}
        decoding="async"
        onError={(event) => { event.currentTarget.hidden = true; }}
      />
      <span className="sr-only">Увеличенное изображение карты «{title}»</span>
    </aside>,
    document.body,
  ) : null;

  if (view === 'gallery') {
    return (
      <div className="bg-trinket-gallery-card-shell">
        <button
          type="button"
          data-tour-id={tourId}
          aria-describedby={tooltip ? tooltipId : undefined}
          onClick={onActivate}
          onMouseEnter={(event) => showTooltip(event.currentTarget)}
          onMouseLeave={() => setTooltip(null)}
          onFocus={(event) => showTooltip(event.currentTarget)}
          onBlur={() => setTooltip(null)}
          className="bg-trinket-gallery-card"
        >
          {cardImage && (
            <img
              src={cardImage}
              alt=""
              width={256}
              height={384}
              loading="lazy"
              decoding="async"
              fetchPriority="low"
              onError={(event) => { event.currentTarget.hidden = true; }}
            />
          )}
          <strong>{title}</strong>
          <BattlegroundTrinketGalleryStats
            pickRate={pickRate}
            averagePlacement={averagePlacement}
            placementBars={placementBars}
          />
        </button>
        {tooltipPreview}
      </div>
    );
  }

  return (
    <div className="bg-trinket-tier-row-shell">
      <button
        type="button"
        data-tour-id={tourId}
        aria-describedby={tooltip ? tooltipId : undefined}
        onClick={onActivate}
        onMouseEnter={(event) => showTooltip(event.currentTarget)}
        onMouseLeave={() => setTooltip(null)}
        onFocus={(event) => showTooltip(event.currentTarget)}
        onBlur={() => setTooltip(null)}
        className="bg-trinket-tier-row"
      >
        {fullArt && (
          <img
            src={fullArt}
            alt=""
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            onError={(event) => { event.currentTarget.hidden = true; }}
            className="bg-trinket-tier-row__backdrop"
          />
        )}
        <span className="bg-trinket-tier-row__identity">
          <span className="bg-trinket-medallion" aria-hidden="true">
            {fullArt && (
              <img
                src={fullArt}
                alt=""
                width={112}
                height={112}
                loading="lazy"
                decoding="async"
                fetchPriority="low"
                onError={(event) => {
                  const failedImage = event.currentTarget;
                  if (cardImage && failedImage.dataset.fallbackApplied !== 'true') {
                    failedImage.dataset.fallbackApplied = 'true';
                    failedImage.src = cardImage;
                    return;
                  }
                  failedImage.hidden = true;
                }}
                className="bg-trinket-medallion__art"
              />
            )}
            <img
              src="/assets/battlegrounds/trinket-medallion-frame.webp"
              alt=""
              width={112}
              height={112}
              loading="lazy"
              decoding="async"
              className="bg-trinket-medallion__frame"
            />
            {cost !== null && <strong className="bg-trinket-medallion__cost">{cost}</strong>}
          </span>
          <span className="bg-trinket-tier-row__copy">
            <span className="bg-trinket-tier-row__title-line">
              <strong>{title}</strong>
              {raceLabel && <small>{raceLabel}</small>}
            </span>
            <span className="bg-trinket-tier-row__description">{description}</span>
          </span>
        </span>

        <span className="bg-trinket-tier-row__metric">
          <strong>{pickRate}</strong>
          <span aria-hidden="true"><i style={{ width: `${pickRateValue}%` }} /></span>
          <small>Частота выбора</small>
        </span>
        <span className="bg-trinket-tier-row__metric bg-trinket-tier-row__metric--placement">
          <strong>{averagePlacement}</strong>
          <span aria-hidden="true"><i style={{ width: `${placementQuality}%` }} /></span>
          <small>Средняя позиция</small>
        </span>
        <span className="bg-trinket-distribution" aria-label={`Распределение мест: ${placementBars.map(bar => `${bar.place} — ${bar.rate.toFixed(1)}%`).join(', ')}`}>
          <span className="bg-trinket-distribution__bars" aria-hidden="true">
            {placementBars.map(bar => (
              <i
                key={bar.place}
                style={{ '--bg-trinket-bar-height': `${bar.height}%` } as CSSProperties}
                title={`${bar.place}-е место: ${bar.rate.toFixed(1).replace('.', ',')}%`}
              />
            ))}
          </span>
          <span className="bg-trinket-distribution__axis" aria-hidden="true"><small>1</small><small>4</small><small>8</small></span>
          <small className="bg-trinket-distribution__label">Распределение мест</small>
        </span>
      </button>
      {tooltipPreview}
    </div>
  );
}
