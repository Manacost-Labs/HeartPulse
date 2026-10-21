import { useEffect, useMemo, useState } from 'react';
import { fetchBattlegroundMinionStats, type BattlegroundMinionStats } from '../modules/battlegrounds/public';
import { Select } from '../vendor/varylo-ui/forms/Select';
import { SegmentedControl } from '../vendor/varylo-ui/navigation/SegmentedControl';
import { minionBoardSlots } from './battlegroundMinionStatsModel';
import '../shared/ui/varyloParchment.css';

type Board = 'normal' | 'taunt';
const ALL = '0';
const percent = (value: number) => `${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;
const signed = (value: number) => value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' });

/** Seven board slots as a heat row; the composition filter re-reads positions only. */
export function BattlegroundMinionBoard({ stats }: { stats: BattlegroundMinionStats }) {
  const [composition, setComposition] = useState(ALL);
  const [positions, setPositions] = useState(stats.positions);
  const [state, setState] = useState<'ready' | 'loading' | 'error'>('ready');
  const [board, setBoard] = useState<Board>(stats.positions.defaultBoard);

  useEffect(() => {
    if (composition === ALL) {
      setPositions(stats.positions);
      setState('ready');
      return;
    }
    const controller = new AbortController();
    setState('loading');
    fetchBattlegroundMinionStats(stats.minion.dbfId, Number(composition), controller.signal)
      .then(result => {
        setPositions(result?.positions ?? { ...stats.positions, normal: null, taunt: null });
        setState('ready');
      })
      .catch(() => { if (!controller.signal.aborted) setState('error'); });
    return () => controller.abort();
  }, [composition, stats]);

  const boards = (['normal', 'taunt'] as const).filter(key => stats.positions[key]);
  const shown = boards.includes(board) ? board : boards[0];
  const slots = useMemo(() => minionBoardSlots(positions[shown] ?? null), [positions, shown]);
  const options = [{ value: ALL, label: 'Все составы' },
    ...stats.positions.compositions.map(item => ({ value: String(item.id), label: item.name }))];

  return (
    <div className="minion-board">
      <div className="minion-board__controls hp-varylo-parchment">
        {boards.length > 1 ? (
          <SegmentedControl
            aria-label="Доска"
            size="sm"
            value={shown}
            onValueChange={value => setBoard(value as Board)}
            options={[{ value: 'normal', label: 'Обычная' }, { value: 'taunt', label: 'С провокацией' }]}
          />
        ) : null}
        {options.length > 1 ? (
          <Select aria-label="Состав" size="sm" options={options} value={composition} onValueChange={setComposition} />
        ) : null}
      </div>
      {state === 'error' ? <p className="minion-board__note">Не удалось загрузить позиции этого состава.</p>
        : slots.length ? (
          <ol className="minion-board__slots" aria-busy={state === 'loading' || undefined}>
            {slots.map(slot => (
              <li key={slot.position} data-strong={slot.heat >= 0.75 || undefined}
                style={{ ['--heat' as string]: slot.heat.toFixed(3) }}>
                <span className="minion-board__position">{slot.position}</span>
                <strong>{slot.popularity === null ? '—' : percent(slot.popularity)}</strong>
                <span
                  className="minion-board__impact"
                  data-tone={slot.impact === null ? 'muted' : slot.impact >= 0.05 ? 'better' : slot.impact <= -0.05 ? 'worse' : undefined}
                  title={slot.impact === null ? 'Меньше 200 досок — влияние не считается' : 'Влияние на место'}
                >
                  {slot.impact === null ? 'ⓘ' : signed(slot.impact)}
                </span>
              </li>
            ))}
          </ol>
        ) : <p className="minion-board__note">В этом составе существо почти не ставят.</p>}
    </div>
  );
}
