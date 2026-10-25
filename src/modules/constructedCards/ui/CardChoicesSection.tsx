'use client';
import { useId, useState } from 'react';
import { LoadingBlock, LoadingSurface } from '../../../shared/ui/LoadingSurface';
import {
  CARD_CHOICE_RANK_OPTIONS, CARD_CHOICE_TIER_LABELS, cardChoiceDate, cardChoiceEmptyText, cardChoiceImage,
  cardChoiceMeanWinrate, cardChoiceTitle, cardChoiceWinrateTone, formatChoicePercent,
  type CardChoiceCard, type CardChoiceFormat, type CardChoiceKind, type CardChoiceOption, type CardChoicePoolCard,
  type CardChoiceRank, type CardChoicesData,
} from '../model/cardChoices';
import { useCardChoices } from '../useCardChoices';
import '../../../shared/ui/LoadingSurface.css';
import './CardChoicesSection.css';

const VISIBLE_OPTIONS = 10;
const VISIBLE_POOL = 40;

export type CardChoicesSectionProps = {
  format: CardChoiceFormat;
  cardId: string;
  kind: CardChoiceKind;
  /** Opens a card render in the page's lightbox. */
  onOpenImage?: (url: string) => void;
};

function cardHref(format: CardChoiceFormat, cardId: string): string {
  return `/standard/cards/${format}/${encodeURIComponent(cardId)}/`;
}

function CardArt({ card, format, onOpenImage }: { card: CardChoiceCard; format: CardChoiceFormat; onOpenImage?: (url: string) => void }) {
  const image = cardChoiceImage(card.cardId);
  const art = <img src={image} alt={`Карта Hearthstone «${card.name}»`} loading="lazy" decoding="async" width={256} height={387} />;
  // Without a lightbox the art is a larger tap target for the same link as the name.
  if (!onOpenImage) return <a className="card-choices__art" href={cardHref(format, card.cardId)} tabIndex={-1}>{art}</a>;
  return (
    <button type="button" className="card-choices__art" aria-label={`Открыть карту «${card.name}» в полном размере`}
      onClick={() => onOpenImage(cardChoiceImage(card.cardId, 512))}>{art}</button>
  );
}

function OptionCard({ option, format, meanWinrate, onOpenImage }: { key?: string; option: CardChoiceOption; format: CardChoiceFormat; meanWinrate: number | null; onOpenImage?: (url: string) => void }) {
  const popularity = option.popularity === null ? 0 : Math.max(0, Math.min(100, option.popularity));
  const tone = option.lowSample ? 'neutral' : cardChoiceWinrateTone(option.winrate, meanWinrate);
  return (
    <li className={`card-choices__option${option.undervalued ? ' is-undervalued' : ''}${option.lowSample ? ' is-thin' : ''}`}>
      <CardArt card={option} format={format} onOpenImage={onOpenImage} />
      <div className="card-choices__option-body">
        <a className="card-choices__name" href={cardHref(format, option.cardId)}>{option.name}</a>
        {option.undervalued && <span className="card-choices__badge" title="Винрейт выше среднего по вариантам, а берут реже большинства">Недооценённый выбор</span>}
        {option.lowSample && <span className="card-choices__thin">Мало данных</span>}
        <dl className="card-choices__metrics">
          <div className="card-choices__metric">
            <dt>Берут</dt>
            <dd>{formatChoicePercent(option.popularity)}</dd>
            <span className="card-choices__bar" aria-hidden="true"><span style={{ width: `${popularity}%` }} /></span>
          </div>
          <div className="card-choices__metric">
            <dt>Винрейт</dt>
            <dd className={`is-${tone}`}>{formatChoicePercent(option.winrate)}</dd>
          </div>
        </dl>
      </div>
    </li>
  );
}

function PoolTile({ card, format, showStats }: { key?: string; card: CardChoicePoolCard | CardChoiceCard; format: CardChoiceFormat; showStats: boolean }) {
  const pool = card as CardChoicePoolCard;
  return (
    <li className="card-choices__tile">
      <a href={cardHref(format, card.cardId)}>
        <img src={cardChoiceImage(card.cardId)} alt="" loading="lazy" decoding="async" width={256} height={387} />
        <span className="card-choices__tile-name">{card.name}</span>
        {showStats && (pool.hasStats
          ? <span className="card-choices__tile-stat">берут {formatChoicePercent(pool.popularity)}</span>
          : <span className="card-choices__tile-stat is-thin">мало данных</span>)}
      </a>
    </li>
  );
}

function FullPool({ data }: { data: CardChoicesData }) {
  const [limit, setLimit] = useState(VISIBLE_POOL);
  const { pool } = data;
  if (!pool.resolved) {
    return (
      <p className="card-choices__note">
        {pool.reason === 'game_state'
          ? 'Варианты этой карты зависят от партии (например, от вашей колоды или руки соперника), поэтому полного пула нет — выше то, что берут чаще всего.'
          : 'Полный пул этой карты пока не определён — выше варианты из статистики HSReplay.'}
      </p>
    );
  }
  if (!pool.cards.length) return null;
  const withStats = pool.cards.filter(card => card.hasStats).length;
  return (
    <details className="card-choices__pool">
      <summary>
        <span>Все варианты · {pool.total}</span>
        <small>{data.tracked ? `со статистикой ${withStats}, без неё — «мало данных»` : 'полный пул из базы карт'}</small>
      </summary>
      {pool.classDependent && <p className="card-choices__note">Нейтральная карта: в игре предлагаются карты вашего класса и нейтральные — здесь показаны все классы.</p>}
      <ul className="card-choices__tiles">
        {pool.cards.slice(0, limit).map(card => <PoolTile key={card.cardId} card={card} format={data.format} showStats={data.tracked} />)}
      </ul>
      {pool.cards.length > limit && (
        <button type="button" className="card-choices__more" onClick={() => setLimit(pool.cards.length)}>
          Показать все · {pool.cards.length}
        </button>
      )}
    </details>
  );
}

function ExcavateTiers({ data }: { data: CardChoicesData }) {
  return (
    <div className="card-choices__tiers">
      {data.pool.tiers.map(tier => (
        <section key={tier.tier} className="card-choices__tier" aria-label={CARD_CHOICE_TIER_LABELS[tier.tier] ?? `Уровень ${tier.tier}`}>
          <h3>{CARD_CHOICE_TIER_LABELS[tier.tier] ?? `Уровень ${tier.tier}`} <span>{tier.cards.length}</span></h3>
          <ul className="card-choices__tiles">
            {tier.cards.map(card => <PoolTile key={card.cardId} card={card} format={data.format} showStats={false} />)}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ChoicesSkeleton() {
  return (
    <LoadingSurface quiet label="Загружаем статистику выбора" layout="grid" className="card-choices__loading" blocksClassName="card-choices__grid">
      {Array.from({ length: 5 }, (_, index) => (
        <span key={index} className="card-choices__skeleton">
          <LoadingBlock className="card-choices__skeleton-art" />
          <LoadingBlock className="loading-block--line" />
          <LoadingBlock className="loading-block--line" />
        </span>
      ))}
    </LoadingSurface>
  );
}

/**
 * "What players pick from Discover" («Что берут из Раскопки») on a card page:
 * HSReplay's options with their pick rate and winrate, a Legend / Bronze–Gold
 * switch, the full pool under «Все варианты», and Excavate («Добыча») treasures
 * by tier. Renders nothing for a card the
 * data source does not know as a choice card.
 */
export function CardChoicesSection({ format, cardId, kind, onOpenImage }: CardChoicesSectionProps) {
  const headingId = useId();
  const [rank, setRank] = useState<CardChoiceRank>('legend');
  const [reload, setReload] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const state = useCardChoices(format, cardId, rank, true, reload);
  if (state.status === 'missing' || state.status === 'idle') return null;
  const data = state.status === 'ready' ? state.data : null;
  const tracked = data ? data.tracked : kind === 'discover' || kind === 'adapt' || kind === 'dredge';
  const rankLabel = CARD_CHOICE_RANK_OPTIONS.find(option => option.id === rank)?.label ?? 'Легенда';
  const options = data?.options ?? [];
  const meanWinrate = cardChoiceMeanWinrate(options);
  const visible = showAll ? options : options.slice(0, VISIBLE_OPTIONS);
  const date = cardChoiceDate(data?.asOf ?? data?.checkedAt ?? null);
  return (
    <section className="constructed-card-detail__section card-choices" aria-labelledby={headingId} data-card-choices={kind}>
      <header className="card-choices__header">
        <div>
          <h2 id={headingId}>{cardChoiceTitle(data?.kind ?? kind)}</h2>
          {tracked && <p className="card-choices__lead"><b>Берут</b> — как часто вариант выбирают, когда его предлагают (поэтому сумма больше 100%). <b>Винрейт</b> — доля побед в партиях, где его взяли; зелёный и красный — выше и ниже среднего по вариантам.</p>}
        </div>
        {tracked && (
          <div className="card-choices__ranks" role="group" aria-label="Ранг">
            {CARD_CHOICE_RANK_OPTIONS.map(option => (
              <button key={option.id} type="button" aria-pressed={rank === option.id}
                onClick={() => { setRank(option.id); setShowAll(false); }}>{option.label}</button>
            ))}
          </div>
        )}
      </header>

      {state.status === 'loading' && <ChoicesSkeleton />}
      {state.status === 'error' && (
        <div className="card-choices__error" role="alert">
          <p>{state.error}</p>
          <button type="button" onClick={() => setReload(value => value + 1)}>Повторить</button>
        </div>
      )}

      {data && (
        <>
          {visible.length > 0
            ? <ol className="card-choices__grid">{visible.map(option => <OptionCard key={option.cardId} option={option} format={data.format} meanWinrate={meanWinrate} onOpenImage={onOpenImage} />)}</ol>
            : data.kind === 'choose_one' && data.pool.cards.length
              ? <ul className="card-choices__tiles card-choices__tiles--wide">{data.pool.cards.map(card => <PoolTile key={card.cardId} card={card} format={data.format} showStats={false} />)}</ul>
              : <p className="card-choices__empty">{cardChoiceEmptyText(data, rankLabel)}</p>}
          {options.length > VISIBLE_OPTIONS && (
            <button type="button" className="card-choices__more" aria-expanded={showAll} onClick={() => setShowAll(value => !value)}>
              {showAll ? 'Свернуть' : `Показать все варианты · ${options.length}`}
            </button>
          )}
          {data.kind === 'excavate' ? <ExcavateTiers data={data} /> : data.kind !== 'choose_one' && <FullPool data={data} />}
          <p className="card-choices__source">
            {data.tracked
              ? <>Источник: {data.sourceUrl ? <a href={data.sourceUrl} target="_blank" rel="noreferrer">HSReplay</a> : 'HSReplay'} · {data.format === 'standard' ? 'Стандарт' : 'Вольный'} · {rankLabel}{date ? ` · данные на ${date}` : ''}</>
              : 'Источник: база карт Hearthstone (HearthstoneJSON)'}
          </p>
        </>
      )}
    </section>
  );
}

export default CardChoicesSection;
