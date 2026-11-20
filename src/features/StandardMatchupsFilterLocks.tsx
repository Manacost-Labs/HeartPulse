import { standardMetaPeriodLabel } from './standardMetaFilterModel';
import type { StandardMetaPeriod } from '../../shared/standardMetaContract';
import { PaidFilterLock } from '../shared/ui/PaidLocks';
import './StandardMatchupsFilterLocks.css';

/** The closed part the page's JSON-LD names: on the group and on every lock. */
const CLOSED = 'paywalled-standard-matchups';

/**
 * The HSGuru filters of the subscriber's panel (rank, period, minimum games) as the guest sees them: in the same
 * places, with the open slice's value and a lock; a press opens the subscription offer. While a signed-in
 * reader's access is still being checked they are neutral and inert: nobody who may have access is offered a purchase.
 */
export function StandardMatchupsFilterLocks({ pending, rankLabel, period, minGames }: {
  pending: boolean;
  rankLabel: string;
  period: string | null;
  minGames: number;
}) {
  const values = [
    ['Рейтинг', rankLabel || 'Все ранги'],
    ['Период', period ? standardMetaPeriodLabel(period as StandardMetaPeriod) : 'Баны'],
    ['Минимум игр в паре', minGames ? minGames.toLocaleString('ru-RU') : '25'],
  ] as const;
  return (
    <div className={`standard-matchups-filters standard-matchups-filter-locks ${CLOSED}`} role="group" aria-label="Срез матчапов"
      aria-busy={pending || undefined}>
      {pending ? <span className="sr-only" role="status">Загружаем фильтры</span> : null}
      {values.map(([label, value]) => (
        // The subscriber's field: a caption over a 40px control, so the swap to the real filters moves nothing.
        <div key={label} className="standard-matchups-filters__field">
          <span aria-hidden="true">{label}</span>
          {pending
            ? <b className="standard-matchups-filter-locks__pending">{value}</b>
            : <PaidFilterLock label={label} value={value} closed={CLOSED} />}
        </div>
      ))}
    </div>
  );
}
