import { funDeckHasFewGames, funDeckInterval, funDeckWhy, type FunDeckRow, type FunDeckTagId } from './funDecksPreview';

function percent(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('ru-RU', { maximumFractionDigits: digits })}%`;
}

/** A 0..1 share as a whole percent. */
export function score(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function metaDistance(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${Math.round((1 - Math.max(0, Math.min(1, value))) * 100)}%`;
}

/** Why the deck is fun: up to three reasons and the nearest meta archetype. */
export function FunDeckWhy({ deck, pinnedTags }: { deck: FunDeckRow; pinnedTags: readonly FunDeckTagId[] }) {
  const why = funDeckWhy(deck, pinnedTags);
  const closest = deck.nearestArchetypeLabel || deck.nearestArchetype;
  if (!why.length && !closest) return null;
  return (
    <div className="fun-deck-card__why">
      {why.length ? (
        <ul role="list" aria-label="Почему фан">
          {why.map(label => <li key={label}>{label}</li>)}
        </ul>
      ) : null}
      {closest ? (
        <p>
          Ближе всего к: <strong>{closest}</strong>
          {deck.maxMetaSimilarity === null ? '' : ` · сходство ${score(deck.maxMetaSimilarity)}`}
        </p>
      ) : null}
    </div>
  );
}

/** Win rate with its interval (when the dataset has one), games with a note when they are few, and the two meta scores. */
export function FunDeckMetrics({ deck, tourAnchor }: { deck: FunDeckRow; tourAnchor: boolean }) {
  const range = funDeckInterval(deck);
  return (
    <dl className="fun-deck-card__metrics" data-tour-id={tourAnchor ? 'fun-decks-card-metrics' : undefined}>
      <div>
        <dt>Винрейт</dt>
        <dd>
          {percent(deck.winRate)}
          {range ? <>{' '}<span className="fun-deck-card__note">({Math.round(range.low)}–{Math.round(range.high)}%)</span></> : null}
        </dd>
      </div>
      <div>
        <dt>Игры</dt>
        <dd>
          {deck.games?.toLocaleString('ru-RU') ?? '—'}
          {funDeckHasFewGames(deck) ? <>{' '}<span className="fun-deck-card__note">мало игр</span></> : null}
        </dd>
      </div>
      <div>
        <dt>Не похожа на мету</dt>
        <dd>{metaDistance(deck.maxMetaSimilarity)}</dd>
      </div>
      <div>
        <dt>Индекс фана</dt>
        <dd>{score(deck.funScore)}</dd>
      </div>
    </dl>
  );
}
