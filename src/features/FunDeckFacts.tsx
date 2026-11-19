import { funDeckHasFewGames, funDeckInterval, funDeckWhy, type FunDecksPayload, type FunDeckRow, type FunDeckTagId } from './funDecksPreview';

function percent(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('ru-RU', { maximumFractionDigits: digits })}%`;
}

/** A 0..1 share as a whole percent. */
export function score(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

/** How unlike the nearest meta deck the list is, as a whole percent. */
export function metaDistance(value: number | null): string {
  return score(value === null ? null : 1 - value);
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

/**
 * Which decks are left out and what the two kinds mean. The numbers are the
 * dataset's own (`methodology`); a detector version that does not publish one
 * gets the sentence without it.
 */
export function FunDecksMethodGate({ methodology }: { methodology: FunDecksPayload['methodology'] | undefined }) {
  // The same sentences with or without the figures ("—" for an unknown one), so the block keeps its height while the data loads.
  const shared = score(methodology?.ladderMemberSim ?? null);
  const floor = score(methodology?.minFunScore ?? null);
  return (
    <div className="fun-decks-method__gate">
      <p>
        В подборку не попадают колоды, у которых общих карт со списком ладдерного архетипа от {shared},
        которые названы как ладдерный архетип или общим словом вроде Aggro, Dude, Mech.
      </p>
      <p>
        <b>Бру</b> — концепт в названии, острый пакет карт или уникальный список, индекс фана от {floor}.
        {' '}<b>Офф-мета</b> — забытый, непопулярный архетип.
        {' '}Рядом с винрейтом — 95%-й интервал, шире при малом числе игр.
      </p>
    </div>
  );
}
