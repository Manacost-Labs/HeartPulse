import { WinrateMeterFill } from './WinrateMeterFill';
import { BarChart } from '../../../shared/ui/analytics/BarChart';
import '../../../shared/ui/analytics/Analytics.css';
import type { ArenaClassesState } from '../model/state';
import { ArenaClassesSkeleton } from './ArenaClassesSkeleton';
import { ROW_CLASS_NAME, ROW_STYLE } from './arenaClassRow';
import './ArenaClassesBoard.css';

const CLASS_ICON_BY_ID: Record<string, string> = {
  dk:             '/class_icon/ui/deathknight-96.webp',
  'death-knight': '/class_icon/ui/deathknight-96.webp',
  dh:             '/class_icon/ui/demonhunter-96.webp',
  'demon-hunter': '/class_icon/ui/demonhunter-96.webp',
  druid:          '/class_icon/ui/druid-96.webp',
  hunter:         '/class_icon/ui/hunter-96.webp',
  mage:           '/class_icon/ui/mage-96.webp',
  paladin:        '/class_icon/ui/paladin-96.webp',
  priest:         '/class_icon/ui/priest-96.webp',
  rogue:          '/class_icon/ui/rogue-96.webp',
  shaman:         '/class_icon/ui/shaman-96.webp',
  warlock:        '/class_icon/ui/warlock-96.webp',
  warrior:        '/class_icon/ui/warrior-96.webp',
};

export function ArenaClassesBoard({ state, onRetry }: {
  state: ArenaClassesState; onRetry: () => void;
}) {
  const classes = state.data?.classes ?? [];
  const initialLoading = state.status === 'loading' && classes.length === 0;
  return (
    <section aria-label="Статистика классов" aria-busy={state.status === 'loading' && !initialLoading}>
      {state.status === 'error' && <p role="alert" className="arena-classes-notice">Не удалось загрузить статистику классов. Повторите попытку.</p>}
      {state.status === 'empty' && <p role="status" className="arena-classes-notice">Статистики классов пока нет.</p>}
      {initialLoading && <ArenaClassesSkeleton />}
      {classes.length > 0 && <ol aria-label="Рейтинг классов" className="arena-classes-board space-y-2.5 sm:space-y-3 relative">
        {classes.map((cls, index) => {
              const icon    = CLASS_ICON_BY_ID[cls.id];
              const barPct = Math.min(100, Math.max(0, cls.winrate));

              return (
                <li
                  key={cls.id}
                  data-rank={index + 1}
                  data-tour-id={index === 0 ? 'arena-classes-ranking' : undefined}
                  className={ROW_CLASS_NAME}
                  style={ROW_STYLE}
                >
                  <span className="arena-class-rank" aria-label={`Место ${index + 1}`}>{index + 1}</span>
                  {icon && (
                    <img src={icon} alt={cls.name}
                      className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]"
                      draggable={false}
                    />
                  )}

                  {/* The block keeps the name's tight leading: «Охотник на демонов» wraps in
                      10rem, and its two lines still fit the 68 px row of every other class. */}
                  <div className="min-w-0 sm:flex-shrink-0 sm:w-40 leading-tight">
                    <span className="font-hs text-sm sm:text-base text-[#3d2208] tracking-wide leading-tight">
                      {cls.name}
                    </span>
                  </div>

                  <div
                    className="arena-class-meter relative h-7 sm:h-8 rounded-full overflow-hidden sm:flex-grow"
                    data-tour-id={index === 0 ? 'arena-classes-details' : undefined}
                    style={{
                      minWidth: 118,
                      background: 'linear-gradient(180deg,#1a0e06 0%,#2c1a0e 100%)',
                      boxShadow: 'inset 0 3px 8px rgba(0,0,0,0.85), inset 0 -1px 2px rgba(255,255,255,0.05)',
                      border: '1.5px solid #0a0502',
                    }}>
                    <WinrateMeterFill color={cls.color} order={index} label={`${cls.winrate.toFixed(1)}%`} scale={barPct / 100} />
                  </div>

                  {(cls.games ?? 0) > 0 && (
                    <div className="flex-shrink-0 hidden lg:block text-right min-w-[88px]">
                      <span className="text-xs text-[#8b6c42] font-medium">
                        {(cls.games ?? 0).toLocaleString('ru-RU')} игр
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
      </ol>}
      {classes.length > 0 && <details className="arena-classes-chart">
        <summary>График классов и скачивание</summary>
        <BarChart title="Винрейт классов Арены" subtitle="Доля побед · шкала от 0 до 100%" rows={classes.map(cls => ({
          label: cls.name, value: cls.winrate, color: cls.color,
          detail: cls.games == null ? 'Размер выборки не указан' : `${cls.games.toLocaleString('ru-RU')} игр`,
        }))} />
      </details>}
      {(state.status === 'error' || state.status === 'empty') && <button type="button" className="arena-classes-retry" onClick={onRetry}>
        Повторить загрузку
      </button>}
    </section>
  );
}
