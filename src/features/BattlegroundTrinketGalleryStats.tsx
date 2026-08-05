import type { CSSProperties } from 'react';

type GalleryPlacementBar = {
  place: number;
  rate: number;
  height: number;
};

type BattlegroundTrinketGalleryStatsProps = {
  pickRate: string;
  averagePlacement: string;
  placementBars: GalleryPlacementBar[];
};

/** Compact statistical summary that keeps gallery cards easy to compare. */
export function BattlegroundTrinketGalleryStats({
  pickRate,
  averagePlacement,
  placementBars,
}: BattlegroundTrinketGalleryStatsProps) {
  const distributionLabel = placementBars
    .map(bar => `${bar.place} — ${bar.rate.toFixed(1)}%`)
    .join(', ');

  return (
    <span className="bg-trinket-gallery-stats">
      <span className="bg-trinket-gallery-stats__metrics">
        <span><small>Выбор</small><strong>{pickRate}</strong></span>
        <span><small>Среднее место</small><strong>{averagePlacement}</strong></span>
      </span>
      <span
        className="bg-trinket-gallery-stats__distribution"
        aria-label={`Распределение мест: ${distributionLabel}`}
      >
        <span aria-hidden="true">
          {placementBars.map(bar => (
            <i
              key={bar.place}
              style={{ '--bg-trinket-bar-height': `${bar.height}%` } as CSSProperties}
              title={`${bar.place}-е место: ${bar.rate.toFixed(1).replace('.', ',')}%`}
            />
          ))}
        </span>
        <span aria-hidden="true"><small>1</small><small>4</small><small>8</small></span>
      </span>
    </span>
  );
}
