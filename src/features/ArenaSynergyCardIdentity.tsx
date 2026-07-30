import type { ArenaSynergyCard } from '../../shared/arenaSynergyContract';

function cardImage(cardId: string): string {
  return `https://art.hearthstonejson.com/v1/tiles/${encodeURIComponent(cardId)}.webp`;
}

function formatPercent(value: number): string {
  return `${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;
}

export function ArenaSynergyCardIdentity({ card }: { card: ArenaSynergyCard }) {
  return (
    <span className="arena-synergy-card">
      <span className="arena-synergy-card-art" aria-hidden="true">
        <span>{card.cost ?? '•'}</span>
        <img
          src={cardImage(card.id)}
          alt=""
          loading="lazy"
          width={48}
          height={36}
          onError={event => { event.currentTarget.hidden = true; }}
        />
      </span>
      <span>
        <strong>{card.name}</strong>
        <small>
          {card.cost != null ? `${card.cost} маны` : 'Мана —'}
          {' · '}
          {card.deckWinRate != null ? `WR ${formatPercent(card.deckWinRate)}` : `${card.runs} колод`}
          {card.twelveWinRunQuality != null
            ? ` · качество 12W общ. ${formatPercent(card.twelveWinRunQuality)}`
            : ''}
        </small>
      </span>
    </span>
  );
}
