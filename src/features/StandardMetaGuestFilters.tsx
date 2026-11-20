import type { StandardMetaCoin, StandardMetaPeriod } from '../../shared/standardMetaContract';
import { MetaLockedFilter } from './StandardMetaLocks';
import { STANDARD_META_COINS, standardMetaPeriodLabel } from './standardMetaFilterModel';

type MetaMinGames = 100 | 250 | 500 | 1000 | 2500 | 5000;
type MetaPeriod = StandardMetaPeriod;
type MetaCoin = StandardMetaCoin;
const MIN_GAMES: MetaMinGames[] = [100, 250, 500, 1000, 2500, 5000];

/** HSGuru's coin filter: all games, the player going first, or second with the Coin. */
function MetaCoinSelect({ value, onChange }: { value: MetaCoin; onChange: (coin: MetaCoin) => void }) {
  return (
    <label className="standard-meta__select">
      <span className="standard-meta__control-label">Очерёдность хода</span>
      <select value={value} onChange={event => onChange(event.target.value as MetaCoin)}>
        {STANDARD_META_COINS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </label>
  );
}

type PeriodOption = { id: MetaPeriod; label: string };

/** Period, coin and game floor: selects for a subscriber, locks with the open slice's values for a guest. */
export function PeriodCoinFloorFilters({ hasFullAccess, selectedPeriod, periodOptions, onPeriod, coin, onCoin, minGames, onMinGames }: {
  hasFullAccess: boolean; selectedPeriod: MetaPeriod; periodOptions: PeriodOption[]; onPeriod: (period: MetaPeriod) => void;
  coin: MetaCoin; onCoin: (coin: MetaCoin) => void; minGames: MetaMinGames; onMinGames: (minGames: MetaMinGames) => void;
}) {
  if (!hasFullAccess) {
    return (<>
      <MetaLockedFilter label="Период" value={standardMetaPeriodLabel(selectedPeriod)} />
      <MetaLockedFilter label="Очерёдность хода" value="Любой игрок" />
      <MetaLockedFilter label="Минимум игр" value={minGames.toLocaleString('ru-RU')} />
    </>);
  }
  return (<>
    <label className="standard-meta__select">
      <span className="standard-meta__control-label">Период</span>
      <select value={selectedPeriod} onChange={event => onPeriod(event.target.value as MetaPeriod)}>
        {periodOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </label>
    <MetaCoinSelect value={coin} onChange={onCoin} />
    <label className="standard-meta__select">
      <span className="standard-meta__control-label">Минимум игр</span>
      <select value={minGames} onChange={event => onMinGames(Number(event.target.value) as MetaMinGames)}>
        {MIN_GAMES.map(value => <option key={value} value={value}>{value.toLocaleString('ru-RU')}</option>)}
      </select>
    </label>
  </>);
}
