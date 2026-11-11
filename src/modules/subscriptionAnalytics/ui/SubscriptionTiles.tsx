import type { SubscriptionTile } from '../model/subscriptionTiles';

const tone = (tile: SubscriptionTile) => (tile.id !== 'netChange' || tile.value === null || tile.value === 0 ? undefined : tile.value > 0 ? 'up' : 'down');

/** Плитки сводки: «нет данных» вместо 0 для процента, которого источник не дал. */
export function SubscriptionTiles({ tiles }: { tiles: SubscriptionTile[] }) {
  return <ul className="sa-tiles" aria-label="Сводка за период">
    {tiles.map(tile => <li key={tile.id} className="sa-tile" data-tile={tile.id}>
      <span className="sa-tile__label">{tile.label}</span>
      {tile.value === null
        ? <strong className="sa-tile__value" data-empty="">нет данных</strong>
        : <strong className="sa-tile__value" data-tone={tone(tile)}>{tile.text}</strong>}
      <small className="sa-tile__hint">{tile.hint}</small>
    </li>)}
  </ul>;
}

export function SubscriptionTilesSkeleton() {
  return <div className="sa-tiles sa-tiles--skeleton" aria-hidden="true">
    {Array.from({ length: 10 }, (_, index) => <div key={index} className="sa-skeleton sa-skeleton--tile" />)}
  </div>;
}
