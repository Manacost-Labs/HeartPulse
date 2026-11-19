'use client';
import { useEffect, useId, useMemo, useState } from 'react';
import { LoadingBlock, LoadingSurface } from '../../../shared/ui/LoadingSurface';
import {
  assembleActiveBase, assembleBasesByOffer, assembleBestBase, assembleOptionsOfBase,
  assembleRankableDonors, assembleWinrateTone, bestOfOffered,
  type AssembleBase, type AssembleCard, type AssembleDonor, type AssembleVariant, type CardAssembleData,
} from '../model/cardAssemble';
import { cardChoiceDate, formatChoicePercent } from '../model/cardChoices';
import { useCardAssemble } from '../useCardAssemble';
import '../../../shared/ui/LoadingSurface.css';

// The stylesheets load with the section, not with the page: a static import would put them into
// the initial CSS of every card page, and only 13 cards render this section.
const loadStyles = () => Promise.all([import('./CardChoicesSection.css'), import('./CardAssembleSection.css')]);

const VISIBLE_BUILDS = 10;
/** Portraits shown before «Показать всех»: three rows of eight on a desktop, two rows of three on a phone. */
const VISIBLE_PORTRAITS = { wide: 24, phone: 6 };
const PHONE_QUERY = '(max-width: 640px)';
const visiblePortraits = () => (typeof window !== 'undefined' && window.matchMedia(PHONE_QUERY).matches ? VISIBLE_PORTRAITS.phone : VISIBLE_PORTRAITS.wide);
/** Above this many portraits the ribbon gets a search field. */
const SEARCH_FROM = 20;

export type CardAssembleSectionProps = {
  format: CardAssembleData['format'];
  cardId: string;
};

const cardHref = (format: CardAssembleData['format'], cardId: string) => `/standard/cards/${format}/${encodeURIComponent(cardId)}/`;

/** Trimmed original art, so the circle shows the creature and not the card frame. */
const portraitUrl = (cardId: string) =>
  `/api/public-resource/hsjson/v1/orig/${encodeURIComponent(cardId)}.png?width=160&quality=82&format=webp&trim=1`;

function plural(count: number, one: string, few: string, many: string): string {
  const tail = count % 100;
  if (tail >= 11 && tail <= 14) return many;
  const last = count % 10;
  if (last === 1) return one;
  return last >= 2 && last <= 4 ? few : many;
}

function Portrait({ card, className = '' }: { card: AssembleCard; className?: string }) {
  return (
    <span className={`assemble-portrait ${className}`.trim()}>
      <img src={portraitUrl(card.cardId)} alt="" loading="lazy" decoding="async" width={80} height={80} />
    </span>
  );
}

type PickerItem = { id: string; card: AssembleCard; note: string };

/** Round portraits of cards to choose from: a wrapped ribbon, with a search field when there are many. */
function PortraitPicker({ items, selected, onPick, label, searchLabel, size }: {
  items: PickerItem[];
  selected: readonly string[];
  onPick: (id: string) => void;
  label: string;
  searchLabel: string;
  size: 'large' | 'small';
}) {
  const [query, setQuery] = useState('');
  const [all, setAll] = useState(false);
  const [limit] = useState(visiblePortraits);
  const needle = query.trim().toLocaleLowerCase('ru');
  const matches = needle ? items.filter(item => item.card.name.toLocaleLowerCase('ru').includes(needle)) : items;
  const shown = needle || all ? matches : matches.slice(0, limit);
  return (
    <div className={`assemble-picker assemble-picker--${size}`}>
      {items.length > SEARCH_FROM && (
        <label className="assemble-search">
          <span className="assemble-sr">{searchLabel}</span>
          <input type="search" value={query} placeholder={searchLabel} autoComplete="off" enterKeyHint="search"
            onChange={event => setQuery(event.target.value)} />
        </label>
      )}
      {shown.length > 0
        ? (
          <ul className="assemble-picker__list" aria-label={label}>
            {shown.map(item => (
              <li key={item.id}>
                <button type="button" aria-pressed={selected.includes(item.id)} onClick={() => onPick(item.id)}>
                  <Portrait card={item.card} />
                  <span className="assemble-picker__name">{item.card.name}</span>
                  <span className="assemble-picker__note">{item.note}</span>
                </button>
              </li>
            ))}
          </ul>
        )
        : <p className="assemble-note">По запросу «{query.trim()}» никого не нашли.</p>}
      {!needle && matches.length > limit && (
        <button type="button" className="card-choices__more" aria-expanded={all} onClick={() => setAll(value => !value)}>
          {all ? 'Свернуть' : `Показать всех · ${matches.length}`}
        </button>
      )}
    </div>
  );
}

/** One build: the plate of the card text, the base's half in ink and the donor's half in gold. */
function BuildRow({ variant, base, format, best, bestThin }: {
  key?: string;
  variant: AssembleVariant;
  base: AssembleBase;
  format: CardAssembleData['format'];
  best?: boolean;
  bestThin?: boolean;
}) {
  const { donor, option } = variant;
  const pick = option.pickRate === null ? 0 : Math.max(0, Math.min(100, option.pickRate));
  const tone = option.lowSample ? 'neutral' : assembleWinrateTone(option.winRate, base);
  const text = option.text;
  const donorHalf = option.half;
  return (
    <li className={`assemble-row${best ? ' is-best' : ''}${option.lowSample ? ' is-thin' : ''}`}>
      {best && <span className="assemble-row__best">{bestThin ? 'Лучший из того, что есть' : 'Лучший выбор'}</span>}
      <a className="assemble-row__portrait" href={cardHref(format, donor.card.cardId)} tabIndex={-1} aria-hidden="true">
        <Portrait card={donor.card} />
      </a>
      <div className="assemble-row__body">
        <div className="assemble-row__head">
          <a className="assemble-row__name" href={cardHref(format, donor.card.cardId)}>{donor.card.name}</a>
          <span className="assemble-row__half">{donorHalf === 'effect' ? 'берём эффект' : 'берём условие'}</span>
          {option.undervalued && <span className="card-choices__badge" title="Винрейт выше среднего по сборкам, а берут реже большинства">Недооценённый выбор</span>}
          {option.lowSample && <span className="card-choices__thin">Мало данных</span>}
        </div>
        {text
          ? (
            <p className="assemble-text">
              <span className={donorHalf === 'trigger' ? 'is-donor' : 'is-base'}>
                <span className="assemble-sr">{donorHalf === 'trigger' ? `От донора «${donor.card.name}»: ` : `От базы «${base.card.name}»: `}</span>
                {text.trigger}
              </span>
              <span className="assemble-seam" aria-hidden="true" />
              <span className={donorHalf === 'effect' ? 'is-donor' : 'is-base'}>
                <span className="assemble-sr">{donorHalf === 'effect' ? `От донора «${donor.card.name}»: ` : `От базы «${base.card.name}»: `}</span>
                {text.effect}
              </span>
            </p>
          )
          : <p className="assemble-text is-missing">Текст этой сборки ещё не собран.</p>}
      </div>
      <dl className="assemble-row__metrics">
        <div className="assemble-metric">
          <dt>Берут</dt>
          <dd>{formatChoicePercent(option.pickRate)}</dd>
          <span className="card-choices__bar" aria-hidden="true"><span style={{ width: `${pick}%` }} /></span>
        </div>
        <div className="assemble-metric">
          <dt>Винрейт</dt>
          <dd className={`is-${tone}`}>{formatChoicePercent(option.winRate)}</dd>
        </div>
      </dl>
    </li>
  );
}

function BuildsSkeleton() {
  return (
    <LoadingSurface quiet label="Загружаем сборки" layout="grid" className="assemble-loading" blocksClassName="assemble-loading__rows">
      {Array.from({ length: 4 }, (_, index) => <LoadingBlock key={index} className="assemble-loading__row" />)}
    </LoadingSurface>
  );
}

function Legend() {
  return (
    <p className="assemble-legend">
      <span className="is-base">Половина базы</span>
      <span className="assemble-seam" aria-hidden="true" />
      <span className="is-donor">Половина донора</span>
    </p>
  );
}

function BaseSummary({ base, format }: { base: AssembleBase; format: CardAssembleData['format'] }) {
  return (
    <div className="assemble-base" data-base={base.card.cardId}>
      <Portrait card={base.card} className="assemble-portrait--big" />
      <div>
        <p className="assemble-base__label">Основа сборки</p>
        <a className="assemble-base__name" href={cardHref(format, base.card.cardId)}>{base.card.name}</a>
      </div>
      <dl className="assemble-base__facts">
        <div><dt>Выпадает</dt><dd>{formatChoicePercent(base.offerRate)}</dd></div>
        <div>
          <dt>Винрейт</dt>
          <dd className={`is-${base.lowSample ? 'neutral' : assembleWinrateTone(base.winRate, base)}`}>{formatChoicePercent(base.winRate)}</dd>
        </div>
        <div><dt>Доноров</dt><dd>{base.donorsTotal}</dd></div>
      </dl>
    </div>
  );
}

function OfferedPanel({ base, format }: { base: AssembleBase; format: CardAssembleData['format'] }) {
  const donors = useMemo(() => assembleRankableDonors(base), [base]);
  const [chosen, setChosen] = useState<string[]>([]);
  // The picker folds away once two donors are chosen, so the four builds sit right under the slots.
  const [editing, setEditing] = useState(false);
  const byId = (id: string | undefined) => donors.find(donor => donor.card.cardId === id) ?? null;
  const pick = (id: string) => {
    const next = chosen.includes(id) ? chosen.filter(item => item !== id) : chosen.length < 2 ? [...chosen, id] : [chosen[0] as string, id];
    setChosen(next);
    setEditing(false);
  };
  const showPicker = chosen.length < 2 || editing;
  const result = chosen.length === 2 ? bestOfOffered(base, chosen[0] as string, chosen[1] as string) : null;
  const ordered = result
    ? [result.best, ...result.variants.filter(variant => variant !== result.best)
      .sort((a, b) => (b.option.winRate ?? -1) - (a.option.winRate ?? -1))]
    : [];
  const items = donors.map(donor => ({ id: donor.card.cardId, card: donor.card, note: donor.offerRate === null ? '' : `выпадает ${formatChoicePercent(donor.offerRate)}` }));
  return (
    <div className="assemble-offer">
      <p className="assemble-offer__hint">Игра предложила двух существ? Отметьте их ниже: покажем четыре сборки и лучшую из них.</p>
      <div className="assemble-slots" aria-live="polite">
        {[0, 1].map(index => {
          const donor: AssembleDonor | null = byId(chosen[index]);
          return donor
            ? (
              <button key={index} type="button" className="assemble-slot is-filled" aria-label={`Убрать «${donor.card.name}»`} onClick={() => pick(donor.card.cardId)}>
                <Portrait card={donor.card} />
                <span className="assemble-slot__name">{donor.card.name}</span>
              </button>
            )
            : (
              <span key={index} className="assemble-slot">
                <span className="assemble-slot__empty">{index + 1}</span>
                <span className="assemble-slot__name">{index === 0 ? 'Первое существо' : 'Второе существо'}</span>
              </span>
            );
        })}
      </div>
      {chosen.length === 2 && !editing && (
        <button type="button" className="assemble-edit" onClick={() => setEditing(true)}>Изменить выбор</button>
      )}
      {showPicker && (donors.length > 0
        ? <PortraitPicker items={items} selected={chosen} onPick={pick} label="Существа, которых могла предложить игра" searchLabel="Найти существо" size="small" />
        : <p className="assemble-note">По этой базе пока нет данных HSReplay о сборках.</p>)}
      {chosen.length === 2 && !editing && (result
        ? (
          <>
            <ol className="assemble-rows" aria-label="Четыре сборки из двух предложенных существ">
              {ordered.map(variant => (
                <BuildRow key={`${variant.donor.card.cardId}:${variant.option.half}`} variant={variant} base={base} format={format}
                  best={variant === result.best} bestThin={result.lowSample} />
              ))}
            </ol>
            {result.lowSample && <p className="assemble-note">У всех четырёх сборок мало партий — лучший выбор ненадёжен.</p>}
          </>
        )
        : <p className="assemble-note">Для этих двух существ нет данных о винрейте.</p>)}
    </div>
  );
}

/**
 * «Сборка» (Assemble) on the page of each of the 13 cards with the keyword: which base
 * creatures the game rolls, which builds with a donor win most, and «Мне предложили» —
 * the best of the four builds from two offered donors. Renders nothing for a card the
 * data source does not know.
 */
export function CardAssembleSection({ format, cardId }: CardAssembleSectionProps) {
  const headingId = useId();
  const [selected, setSelected] = useState<number | 'top'>('top');
  const [reload, setReload] = useState(0);
  const [view, setView] = useState<'best' | 'offered'>('best');
  const [showAll, setShowAll] = useState(false);
  const state = useCardAssemble(format, cardId, selected, true, reload);
  const [styled, setStyled] = useState(false);
  useEffect(() => {
    let alive = true;
    void loadStyles().then(() => { if (alive) setStyled(true); }, () => { if (alive) setStyled(true); });
    return () => { alive = false; };
  }, []);
  // The ribbon stays on screen while the donors of another base load.
  const [kept, setKept] = useState<CardAssembleData | null>(null);
  useEffect(() => { if (state.status === 'ready') setKept(state.data); }, [state]);
  const data = state.status === 'ready' ? state.data : kept;
  const ribbon = useMemo(() => (data ? assembleBasesByOffer(data) : []), [data]);

  if (!styled || state.status === 'missing' || state.status === 'idle') return null;
  const loadingBase = state.status === 'loading';
  const active = state.status === 'ready' ? assembleActiveBase(state.data) : null;
  const shownBase = (selected === 'top' ? active : data?.bases.find(base => base.card.dbfId === selected)) ?? active;
  const best = data ? assembleBestBase(data) : null;
  const date = cardChoiceDate(data?.asOf ?? data?.checkedAt ?? null);
  const hasBases = !!data && data.state === 'ok' && data.bases.length > 0;
  const variants = active ? assembleOptionsOfBase(active) : [];
  const visible = showAll ? variants : variants.slice(0, VISIBLE_BUILDS);
  const items: PickerItem[] = ribbon.map(base => ({
    id: String(base.card.dbfId),
    card: base.card,
    note: base.offerRate === null ? '' : `выпадает ${formatChoicePercent(base.offerRate)}`,
  }));
  const chooseBase = (id: string) => {
    setSelected(Number(id));
    setShowAll(false);
  };

  return (
    <section className="constructed-card-detail__section card-choices assemble" aria-labelledby={headingId} data-card-assemble="">
      <header className="assemble-header">
        <div>
          <h2 id={headingId}>Сборка</h2>
          {hasBases && data && (
            <p className="assemble-summary">
              <span>Пул <b>{data.basesTotal} {plural(data.basesTotal, 'существо', 'существа', 'существ')}</b></span>
              {data.winRate !== null && <span>средний винрейт после сборки <b>{formatChoicePercent(data.winRate)}</b></span>}
              {best && <span>лучшая база — <b>{best.card.name}</b> {formatChoicePercent(best.winRate)}</span>}
            </p>
          )}
        </div>
        {data?.timeRange === 'LAST_7_DAYS' && <span className="assemble-period">За 7 дней</span>}
      </header>

      {!data && state.status === 'loading' && <BuildsSkeleton />}
      {!data && state.status === 'error' && (
        <div className="card-choices__error" role="alert">
          <p>{state.error}</p>
          <button type="button" onClick={() => setReload(value => value + 1)}>Повторить</button>
        </div>
      )}

      {data && !hasBases && (
        <p className="card-choices__empty">Мало данных: HSReplay ещё не набрал достаточно партий с этой картой.</p>
      )}

      {data && hasBases && (
        <>
          <h3 className="assemble-title">Что выпало?</h3>
          <PortraitPicker items={items} selected={shownBase ? [String(shownBase.card.dbfId)] : []} onPick={chooseBase}
            label="Существа, которых игра может выбрать основой" searchLabel="Найти существо по названию" size="large" />

          {shownBase && <BaseSummary base={shownBase} format={format} />}

          <div className="assemble-tabs" role="group" aria-label="Что показать">
            <button type="button" aria-pressed={view === 'best'} onClick={() => setView('best')}>Лучшие сборки</button>
            <button type="button" aria-pressed={view === 'offered'} onClick={() => setView('offered')}>Мне предложили</button>
          </div>

          {loadingBase && <BuildsSkeleton />}
          {state.status === 'error' && (
            <div className="card-choices__error" role="alert">
              <p>{state.error}</p>
              <button type="button" onClick={() => setReload(value => value + 1)}>Повторить</button>
            </div>
          )}
          {!loadingBase && active && view === 'best' && (
            variants.length > 0
              ? (
                <>
                  <Legend />
                  <ol className="assemble-rows" aria-label="Лучшие сборки">
                    {visible.map(variant => <BuildRow key={`${variant.donor.card.cardId}:${variant.option.half}`} variant={variant} base={active} format={format} />)}
                  </ol>
                  {variants.length > VISIBLE_BUILDS && (
                    <button type="button" className="card-choices__more" aria-expanded={showAll} onClick={() => setShowAll(value => !value)}>
                      {showAll ? 'Свернуть' : `Показать все · ${variants.length}`}
                    </button>
                  )}
                </>
              )
              : <p className="card-choices__empty">По этой основе пока нет данных о сборках.</p>
          )}
          {!loadingBase && active && view === 'offered' && <OfferedPanel key={active.card.dbfId} base={active} format={format} />}

          <p className="card-choices__source">
            Источник: {data.sourceUrl ? <a href={data.sourceUrl} target="_blank" rel="noreferrer">HSReplay</a> : 'HSReplay'} · {data.format === 'standard' ? 'Стандарт' : 'Вольный'}
            {date ? ` · данные на ${date}` : ''}. Винрейт цветом — к среднему по сборкам этой основы.
          </p>
        </>
      )}
    </section>
  );
}

export default CardAssembleSection;
