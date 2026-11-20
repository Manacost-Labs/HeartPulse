import type { ReactNode } from 'react';
import { LayoutGrid, List } from 'lucide-react';
import { TierListChoice, TierListChoices } from '../modules/battlegrounds/public';
import {
  TRINKET_MMR_OPTIONS,
  TRINKET_TIME_RANGE_OPTIONS,
  updateTrinketUrlState,
  type TrinketMmr,
  type TrinketTimeRange,
  type TrinketView,
} from './battlegroundTrinkets';
import { BG_RACE_ICON, BG_RACE_NAMES, bgTavernIcon } from './battlegroundTierListItems';
import type { BattlegroundStrategySource, BattlegroundTrinketSize } from './battlegroundTierListState';

export type TierListFilters = { primary?: ReactNode; secondary?: { summary: string; content: ReactNode } };

/** Race and tavern choices of the minion list; the choices come from the loaded minions. */
export function minionFilters({ races, taverns, race, onRace, tavern, onTavern }: {
  races: string[];
  taverns: string[];
  race: string;
  onRace: (race: string) => void;
  tavern: string;
  onTavern: (tavern: string) => void;
}): TierListFilters {
  return {
    primary: (
      <TierListChoices label="Тип существа" scroll>
        {races.map(entry => (
          <TierListChoice key={entry} active={race === entry} onClick={() => onRace(entry)} label={BG_RACE_NAMES[entry] || entry}>
            {entry !== 'ALL' && BG_RACE_ICON[entry] ? <img src={BG_RACE_ICON[entry]} alt="" width={30} height={30} loading="lazy" /> : entry === 'ALL' ? 'Все' : entry}
          </TierListChoice>
        ))}
      </TierListChoices>
    ),
    secondary: {
      summary: tavern === 'ALL' ? 'Таверна: все' : `Таверна: ${tavern}`,
      content: (
        <TierListChoices label="Таверна" legend>
          {taverns.map(entry => (
            <TierListChoice key={entry} active={tavern === entry} onClick={() => onTavern(entry)}
              label={entry === 'ALL' ? 'Все уровни таверны' : `Уровень таверны ${entry}`}>
              {entry === 'ALL' ? 'Все' : <img src={bgTavernIcon(entry)} alt="" width={30} height={30} loading="lazy" />}
            </TierListChoice>
          ))}
        </TierListChoices>
      ),
    },
  };
}

/** The source of the strategy list; the choice is kept in the address. */
export function strategyFilters({ source, onSource }: {
  source: BattlegroundStrategySource;
  onSource: (source: BattlegroundStrategySource) => void;
}): TierListFilters {
  return {
    primary: (
      <TierListChoices label="Источник стратегий">
        {(['firestone', 'hsreplay'] as const).map(entry => (
          <TierListChoice key={entry} active={source === entry} onClick={() => {
            onSource(entry);
            const params = new URLSearchParams(window.location.search);
            params.set('source', entry);
            window.history.replaceState(window.history.state, '', `${window.location.pathname}?${params.toString()}`);
          }}>
            {entry === 'firestone' ? 'Firestone' : 'HSReplay'}
          </TierListChoice>
        ))}
      </TierListChoices>
    ),
  };
}

/** Size, view, rating range and period of the trinket list; every choice is kept in the address. */
export function trinketFilters({ sizes, size, onSize, view, onView, mmr, onMmr, timeRange, onTimeRange }: {
  sizes: string[];
  size: BattlegroundTrinketSize;
  onSize: (size: BattlegroundTrinketSize) => void;
  view: TrinketView;
  onView: (view: TrinketView) => void;
  mmr: TrinketMmr;
  onMmr: (mmr: TrinketMmr) => void;
  timeRange: TrinketTimeRange;
  onTimeRange: (timeRange: TrinketTimeRange) => void;
}): TierListFilters {
  const mmrLabel = TRINKET_MMR_OPTIONS.find(option => option.id === mmr)?.label || '';
  const periodLabel = TRINKET_TIME_RANGE_OPTIONS.find(option => option.id === timeRange)?.label || '';
  return {
    primary: (
      <>
        {sizes.length > 1 && <TierListChoices label="Размер аксессуара">
          {sizes.map(rawSize => {
            const entry = rawSize as BattlegroundTrinketSize;
            return (
              <TierListChoice key={entry} active={size === entry} onClick={() => { onSize(entry); updateTrinketUrlState({ size: entry }); }}>
                {entry === 'ALL' ? 'Все' : entry === 'SMALL' ? 'Малые' : 'Большие'}
              </TierListChoice>
            );
          })}
        </TierListChoices>}
        <TierListChoices label="Вид списка">
          <TierListChoice active={view === 'table'} label="Таблица" onClick={() => { onView('table'); updateTrinketUrlState({ view: 'table' }); }}>
            <List aria-hidden="true" />
          </TierListChoice>
          <TierListChoice active={view === 'gallery'} label="Галерея" onClick={() => { onView('gallery'); updateTrinketUrlState({ view: 'gallery' }); }}>
            <LayoutGrid aria-hidden="true" />
          </TierListChoice>
        </TierListChoices>
      </>
    ),
    secondary: {
      summary: `${mmrLabel} · ${periodLabel}`,
      content: (
        <>
          <TierListChoices label="Рейтинг игроков" legend>
            {TRINKET_MMR_OPTIONS.map(option => (
              <TierListChoice key={option.id} active={mmr === option.id}
                onClick={() => { onMmr(option.id); updateTrinketUrlState({ mmr: option.id }); }}>
                {option.label}
              </TierListChoice>
            ))}
          </TierListChoices>
          <TierListChoices label="Период" legend>
            {TRINKET_TIME_RANGE_OPTIONS.map(option => (
              <TierListChoice key={option.id} active={timeRange === option.id}
                onClick={() => { onTimeRange(option.id); updateTrinketUrlState({ timeRange: option.id }); }}>
                {option.label}
              </TierListChoice>
            ))}
          </TierListChoices>
        </>
      ),
    },
  };
}
