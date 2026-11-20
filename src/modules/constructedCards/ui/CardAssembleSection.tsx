'use client';
import { useEffect, useId, useMemo, useState } from 'react';
import {
  assembleActiveBase, assembleBasesByOffer, assembleBestBase, assembleOptionsOfBase,
  type CardAssembleData,
} from '../model/cardAssemble';
import { creaturesLabel } from '../model/plural';
import { cardChoiceDate, formatChoicePercent } from '../model/cardChoices';
import { useCardAssemble } from '../useCardAssemble';
import { BuildRow, BuildsSkeleton, Legend } from './AssembleBuilds';
import { assembleBaseAfterClassChange, assembleBasesForClass, assembleClassDependent } from '../model/cardAssemblePool';
import { ClassChooser } from './AssembleClasses';
import { BaseSummary, OfferedPanel } from './AssembleOffered';
import { PortraitPicker, type PickerItem } from './AssemblePicker';
import '../../../shared/ui/LoadingSurface.css';

// The stylesheets load with the section, not with the page: a static import would put them into
// the initial CSS of every card page, and only 13 cards render this section.
const loadStyles = () => Promise.all([import('./CardChoicesSection.css'), import('./CardAssembleSection.css')]);

const VISIBLE_BUILDS = 10;

export type CardAssembleSectionProps = {
  format: CardAssembleData['format'];
  cardId: string;
  /** What the server read for the default base: shown at once, the first request is skipped. */
  initial?: CardAssembleData | null;
  /** The page of the tool brings the stylesheets itself, so the section draws on the server too. */
  staticStyles?: boolean;
  /** Replaces «Сборка» when the page already has its own H1. */
  heading?: string;
};


/**
 * «Сборка» (Assemble) on the page of each of the 13 cards with the keyword: which base
 * creatures the game rolls, which builds with a donor win most, and «Мне предложили» —
 * the best of the four builds from two offered donors. Renders nothing for a card the
 * data source does not know.
 */
export function CardAssembleSection({ format, cardId, initial = null, staticStyles = false, heading = 'Сборка' }: CardAssembleSectionProps) {
  const headingId = useId();
  const [selected, setSelected] = useState<number | 'top'>('top');
  const [reload, setReload] = useState(0);
  const [view, setView] = useState<'best' | 'offered'>('best');
  const [showAll, setShowAll] = useState(false);
  const [playerClass, setPlayerClass] = useState<string | null>(null);
  const state = useCardAssemble(format, cardId, selected, true, reload, initial);
  const [styled, setStyled] = useState(staticStyles);
  useEffect(() => {
    if (staticStyles) return undefined;
    let alive = true;
    void loadStyles().then(() => { if (alive) setStyled(true); }, () => { if (alive) setStyled(true); });
    return () => { alive = false; };
  }, [staticStyles]);
  // The ribbon stays on screen while the donors of another base load.
  const [kept, setKept] = useState<CardAssembleData | null>(initial);
  useEffect(() => { if (state.status === 'ready') setKept(state.data); }, [state]);
  const data = state.status === 'ready' ? state.data : kept;
  const classDependent = assembleClassDependent(data);
  const ribbon = useMemo(() => (data ? assembleBasesForClass(assembleBasesByOffer(data), classDependent ? playerClass : null) : []), [data, classDependent, playerClass]);

  // «not_collected»: the source does not track this card yet, so there is nothing to show (as for a 404).
  if (!styled || state.status === 'missing' || state.status === 'idle' || (state.status === 'ready' && state.data.state === 'not_collected')) return null;
  const loadingBase = state.status === 'loading';
  const active = state.status === 'ready' ? assembleActiveBase(state.data) : null;
  const shownBase = (selected === 'top' ? active : data?.bases.find(base => base.card.dbfId === selected)) ?? active;
  const best = data ? assembleBestBase(data) : null;
  const date = cardChoiceDate(data?.asOf ?? data?.checkedAt ?? null);
  const hasBases = !!data && data.state === 'ok' && data.bases.length > 0;
  const variants = active ? assembleOptionsOfBase(active) : [];
  const visible = showAll ? variants : variants.slice(0, VISIBLE_BUILDS);
  const items: PickerItem[] = ribbon.map(base => ({ id: String(base.card.dbfId), card: base.card, note: base.offerRate === null ? '' : `выпадает ${formatChoicePercent(base.offerRate)}` }));
  const changeClass = (next: string | null) => {
    setPlayerClass(next);
    const moveTo = data ? assembleBaseAfterClassChange(data, shownBase, next) : null;
    if (moveTo !== null) { setSelected(moveTo); setShowAll(false); }
  };
  const chooseBase = (id: string) => {
    setSelected(Number(id));
    setShowAll(false);
  };

  return (
    <section className="constructed-card-detail__section card-choices assemble" aria-labelledby={headingId} data-card-assemble="">
      <header className="assemble-header">
        <div>
          <h2 id={headingId}>{heading}</h2>
          {hasBases && data && (
            <p className="assemble-summary">
              <span>Пул <b>{data.basesTotal} {creaturesLabel(data.basesTotal)}</b></span>
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
          {classDependent && <ClassChooser value={playerClass} onChange={changeClass} />}
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
          {!loadingBase && active && view === 'offered' && <OfferedPanel key={`${active.card.dbfId}:${playerClass ?? ''}`} base={active} data={data} format={format} playerClass={playerClass} />}

          <p className="card-choices__source">
            Источник: {data.sourceUrl ? <a href={data.sourceUrl} target="_blank" rel="noreferrer">HSReplay</a> : 'HSReplay'} · {data.format === 'standard' ? 'Стандарт' : 'Вольный'}
            {date ? ` · данные на ${date}` : ''} · винрейт цветом — к среднему по сборкам этой основы.
          </p>
        </>
      )}
    </section>
  );
}

export default CardAssembleSection;
