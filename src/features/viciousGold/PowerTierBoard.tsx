import { useMemo, useState } from 'react';
import { TierBadge } from '../../modules/arenaTierList/public';
import { TrendValue } from '../../vendor/varylo-ui/widgets/TrendValue';
import { PaidFilterLock, PaidMetricLock } from '../../shared/ui/PaidLocks';
import { LockMark } from './LockMark';
import { BuildActions } from './BuildActions';
import { DeckName } from './DeckName';
import {
  classIcon, deckCount, groupBySiteTier, percent, rankDelta,
  type ClassDistribution, type TierDeck, type TierSection,
} from './viciousGoldModel';

/** The bar's scale in win-rate percent: 50% sits in the middle, ±10 points fill a half. */
const BAR_SPREAD = 10;

function barStyle(winrate: number) {
  const offset = Math.max(-BAR_SPREAD, Math.min(BAR_SPREAD, winrate - 50)) / BAR_SPREAD * 50;
  return { left: `${offset >= 0 ? 50 : 50 + offset}%`, width: `${Math.abs(offset)}%` };
}

/**
 * The Power Tier of the open frame: as many rows as a vS bracket holds (16) in three tier groups (the usual count of
 * non-empty tiers), split by a fixed scheme, never by the report: the paid rows and tier heads replace the slots
 * without a shift, and the slots say nothing of the tiers, their decks or their order.
 */
const LOCKED_GROUPS = [[1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11], [12, 13, 14, 15, 16]];

/**
 * `locked` (the open frame, #656): the rank tabs stay, the class filter is a lock, and the rows are slots with a lock
 * and no name: the composition and order of the Power Tier, its tiers and win rates are closed.
 */
export function PowerTierBoard({ tierList, classes, copiedDeck, onCopy, locked = false }: {
  tierList: TierSection[];
  classes: ClassDistribution[];
  copiedDeck: string;
  onCopy: (deck: string, code: string) => void;
  locked?: boolean;
}) {
  const [rankBracket, setRankBracket] = useState(() => tierList[0]?.rankBracket ?? 'All ranks');
  const [powerClass, setPowerClass] = useState('all');
  const selected = tierList.find(section => section.rankBracket === rankBracket) ?? tierList[0];
  const groups = useMemo(
    () => groupBySiteTier((selected?.decks ?? []).filter(deck => powerClass === 'all' || deck.class === powerClass)),
    [selected, powerClass],
  );
  const baseline = selected && selected !== tierList[0] ? tierList[0]?.rankLabel : null;

  return (
    <section className="vsgold-section vsgold-power" id="vsgold-power" aria-labelledby="vsgold-power-title">
      <header className="vsgold-section__head" data-tour-id="vicious-power">
        <div>
          <h2 id="vsgold-power-title">Power Tier List</h2>
        </div>
      </header>

      <div className="vsgold-power__controls" data-tour-id="vicious-power-filters">
        <div className="vsgold-power__ranks" role="tablist" aria-label="Диапазон рангов">
          {tierList.map(section => (
            <button key={section.rankBracket} type="button" role="tab" aria-selected={section === selected}
              onClick={() => setRankBracket(section.rankBracket)}>{section.rankLabel}</button>
          ))}
        </div>
        {locked ? <span className="vsgold-select"><PaidFilterLock label="Класс" value="Все классы" /></span> : (
          <label className="vsgold-select">
            <span className="sr-only">Класс</span>
            <select value={powerClass} onChange={event => setPowerClass(event.target.value)} aria-label="Класс для Power Tier">
              <option value="all">Все классы</option>
              {classes.map(item => <option key={item.class} value={item.class}>{item.classLabel}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="vsgold-power__legend" aria-hidden="true">
        <span>Колода</span><span title="Ожидаемый винрейт колоды против меты выбранного диапазона рангов (расчёт Vicious Syndicate)">Винрейт: 40% · 50% · 60%</span>{baseline ? <span>п. п. к «{baseline}»</span> : <span />}
      </div>

      {locked ? LOCKED_GROUPS.map((slots, index) => (
        <section key={slots[0]} className="vsgold-tier" data-locked="" aria-labelledby={`vsgold-tier-locked-${index + 1}`}>
          {/* The head of a subscriber's tier group, its letter and range closed. */}
          <header className="vsgold-tier__head">
            <span className="vsgold-tier__badge-slot" aria-hidden="true" />
            <h3 id={`vsgold-tier-locked-${index + 1}`}>Тир <LockMark label="Тир и его колоды" /></h3>
            <small>по подписке</small>
          </header>
          <ol className="vsgold-tier__rows">
            {slots.map(slot => (
              // A subscriber's row with a deck: name and source name, bar, win rate and the copy button, each closed.
              <li key={slot} className="vsgold-power-row vsgold-power-row--locked">
                <span className="vsgold-power-row__rank" />
                <span className="vsgold-power-row__icon" aria-hidden="true" />
                <span className="vsgold-power-row__name">
                  <strong><PaidMetricLock label={`Колода Power Tier, строка ${slot}`} /></strong>
                  <small aria-hidden="true">{'\u00a0'}</small>
                </span>
                <span className="vsgold-power-row__bar" aria-hidden="true" />
                <b className="vsgold-power-row__winrate" aria-hidden="true">{'\u00a0'}</b>
                <span className="vsgold-power-row__delta" />
                <span className="vsgold-build" aria-hidden="true"><span className="vsgold-build__slot" /></span>
              </li>
            ))}
          </ol>
        </section>
      )) : groups.map(group => (
        <section key={group.tier} className="vsgold-tier" data-tier={group.tier} aria-labelledby={`vsgold-tier-${group.tier}`}>
          <header className="vsgold-tier__head">
            <TierBadge tier={group.tier} small />
            <h3 id={`vsgold-tier-${group.tier}`}>Тир {group.tier}</h3>
            <small>винрейт {group.range} · {deckCount(group.decks.length)}</small>
          </header>
          <ol className="vsgold-tier__rows">
            {group.decks.map(deck => (
              <PowerRow key={`${selected?.rankBracket}:${deck.deck}`} deck={deck}
                delta={selected ? rankDelta(deck, selected, tierList) : null} baseline={baseline}
                copiedDeck={copiedDeck} onCopy={onCopy} />
            ))}
          </ol>
        </section>
      ))}
      {!locked && !groups.length && <p className="vsgold-empty">Для этого класса в выбранном диапазоне рангов колод в Power Tier нет.</p>}
    </section>
  );
}

function PowerRow({ deck, delta, baseline, copiedDeck, onCopy }: {
  deck: TierDeck;
  delta: number | null;
  baseline: string | null;
  copiedDeck: string;
  onCopy: (deck: string, code: string) => void;
}) {
  return (
    <li className="vsgold-power-row" data-favoured={deck.winrate >= 50 ? '' : undefined}>
      <span className="vsgold-power-row__rank">#{deck.rank}</span>
      <img src={classIcon(deck.classIcon)} alt="" width="36" height="36" loading="lazy" decoding="async" />
      <DeckName deck={deck} className="vsgold-power-row__name" />
      <span className="vsgold-power-row__bar" aria-hidden="true"><i style={barStyle(deck.winrate)} /></span>
      <b className="vsgold-power-row__winrate">{percent(deck.winrate)}<span className="sr-only"> винрейт</span></b>
      <span className="vsgold-power-row__delta">
        {delta !== null && baseline ? (
          <TrendValue value={delta} format="number" fractionDigits={1} size="sm" locale="ru-RU"
            labels={{ increase: `выше, чем в «${baseline}», на`, decrease: `ниже, чем в «${baseline}», на`, unchanged: `как в «${baseline}»` }} />
        ) : null}
      </span>
      <BuildActions compact deck={`tier:${deck.deck}`} build={deck.build} copiedDeck={copiedDeck} onCopy={onCopy} />
    </li>
  );
}

