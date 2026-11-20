import { forwardRef, Fragment, lazy, Suspense, useDeferredValue, useMemo, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { PaidMetricLock } from '../../shared/ui/PaidLocks';
import { BuildActions } from './BuildActions';
import { DeckName } from './DeckName';
import {
  classIcon, percent, shareOfLeader, thresholdPercent,
  type BuildState, type ClassDistribution, type DeckDistribution,
} from './viciousGoldModel';

// The deck block (render, card list) opens on «Колода», only for a subscriber: its own chunk, not the page's.
const DeckBlock = lazy(() => import('./DeckBlock'));

/** Rows shown before "show all": the first screen of the list, not a scroll box inside the page. */
const FIRST_ROWS = 12;

export const DeckShareList = forwardRef<HTMLDivElement, {
  decks: DeckDistribution[];
  classes: ClassDistribution[];
  minimumFrequency: number;
  deckClass: string;
  onDeckClassChange: (classKey: string) => void;
  buildState: BuildState;
  buildCoverage: { found: number; total: number };
  copiedDeck: string;
  onCopy: (deck: string, code: string) => void;
  /** The open frame (#656): the archetypes in their neutral order; shares and decks are locks. */
  locked?: boolean;
}>(function DeckShareList({ decks, classes, minimumFrequency, deckClass, onDeckClassChange, buildState, buildCoverage, copiedDeck, onCopy, locked = false }, ref) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [openDeck, setOpenDeck] = useState('');
  const [showAll, setShowAll] = useState(false);
  const visible = useMemo(() => {
    const needle = deferredQuery.trim().toLocaleLowerCase('ru-RU');
    return decks.filter(deck => (deckClass === 'all' || deck.class === deckClass)
      && (!needle || `${deck.deck} ${deck.deckLabel}`.toLocaleLowerCase('ru-RU').includes(needle)));
  }, [decks, deckClass, deferredQuery]);
  const filtered = deckClass !== 'all' || deferredQuery.trim() !== '';
  const shown = showAll || filtered ? visible : visible.slice(0, FIRST_ROWS);
  const leader = decks[0]?.frequency ?? 0;

  return (
    <div ref={ref} className="vsgold-decks" id="vsgold-decks" role="group" aria-labelledby="vsgold-decks-title">
      <header className="vsgold-decks__head">
        <div>
          <h3 id="vsgold-decks-title">Архетипы и колоды</h3>
          <p>
            {locked ? 'Архетипы отчёта по классам. Доли и готовые колоды — по подписке.' : `Архетипы от ${thresholdPercent(minimumFrequency)} партий.`}
            {!locked && buildState === 'ready' && buildCoverage.found > 0
              ? ` Готовая колода есть для ${buildCoverage.found} из ${buildCoverage.total}: код импортируется в Hearthstone, «Колода» показывает состав и источник.`
              : null}
          </p>
        </div>
      </header>
      <div className="vsgold-decks__tools" data-tour-id="vicious-decks">
        <label className="vsgold-search"><Search size={16} aria-hidden="true" />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Найти архетип" aria-label="Найти архетип" />
        </label>
        <label className="vsgold-select">
          <span className="sr-only">Класс</span>
          <select value={deckClass} onChange={event => onDeckClassChange(event.target.value)} aria-label="Фильтр колод по классу">
            <option value="all">Все классы</option>
            {classes.map(item => <option key={item.class} value={item.class}>{item.classLabel}</option>)}
          </select>
        </label>
      </div>
      <ol className="vsgold-decks__rows">
        {shown.map((deck, index) => (
          <Fragment key={deck.deck}>
            <li className="vsgold-deck-row" data-tour-id={index === 0 ? 'vicious-build-action' : undefined}>
              <img src={classIcon(deck.classIcon)} alt="" width="36" height="36" loading="lazy" decoding="async" />
              <DeckName deck={deck} className="vsgold-deck-row__name" />
              {locked ? <>
                <span className="vsgold-deck-row__bar" aria-hidden="true" />
                <span className="vsgold-deck-row__share"><PaidMetricLock label={`Доля ${deck.deckLabel}`} /></span>
                <span className="vsgold-build"><PaidMetricLock label={`Колода и код ${deck.deckLabel}`} /></span>
              </> : <>
                <span className="vsgold-deck-row__bar" aria-hidden="true"><i style={{ width: shareOfLeader(deck.frequency, leader) }} /></span>
                <b className="vsgold-deck-row__share">{percent(deck.frequency)}<span className="sr-only"> партий</span></b>
                <BuildActions deck={deck.deck} build={deck.build} copiedDeck={copiedDeck} onCopy={onCopy}
                  expanded={openDeck === deck.deck} onOpen={key => setOpenDeck(current => current === key ? '' : key)} />
              </>}
            </li>
            {openDeck === deck.deck && deck.build && (
              <li className="vsgold-deck-composition" aria-label={`Колода ${deck.deckLabel}`}>
                <Suspense fallback={<p className="vsgold-deck-composition__source">Загружаем колоду…</p>}>
                  <DeckBlock deck={deck} build={deck.build} />
                </Suspense>
              </li>
            )}
          </Fragment>
        ))}
      </ol>
      {!visible.length && <p className="vsgold-empty">По этому фильтру колод нет.</p>}
      {!filtered && !showAll && visible.length > FIRST_ROWS && (
        <button type="button" className="vsgold-decks__more" onClick={() => setShowAll(true)}>
          Показать все {visible.length} <ChevronDown size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
});
