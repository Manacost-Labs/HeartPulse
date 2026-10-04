import { WinrateMeterFill } from './WinrateMeterFill';
import type { ArenaClassesState } from '../model/state';
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
  const maxWinrate = Math.max(...classes.map(item => item.winrate), 1);
  const source = state.data?.source.toLowerCase().includes('firestone') ? 'Firestone' : 'HSReplay';
  return (
    <section aria-label="Статистика классов" aria-busy={state.status === 'loading'}>
      {state.data && (
        <p className="arena-classes-data-meta" data-tour-id="arena-classes-source">
          Источник: {source}. Обновлено: {state.data.updatedAt
            ? <time dateTime={state.data.updatedAt}>{new Date(state.data.updatedAt).toLocaleString('ru-RU', { timeZone: 'UTC' })} UTC</time>
            : 'время не указано'}
        </p>
      )}
      {state.status === 'loading' && <div role="status">Загрузка статистики классов…</div>}
      {state.status === 'error' && <p role="alert" className="arena-classes-notice">Не удалось загрузить статистику классов. Повторите попытку.</p>}
      {state.status === 'empty' && <p role="status" className="arena-classes-notice">Статистики классов пока нет.</p>}
      {state.status === 'stale' && <p role="status" className="arena-classes-notice">Показаны сохранённые данные. Обновление не подтверждено.</p>}
      {state.status === 'loading' && <div aria-hidden="true">{Array.from({ length: 11 }, (_, index) =>
        <div key={index} className="skeleton h-16 sm:h-[72px] w-full mb-3" />)}</div>}
      {classes.length > 0 && <ol aria-label="Рейтинг классов" className="arena-classes-board space-y-2.5 sm:space-y-3 relative">
        {classes.map((cls, index) => {
              const icon    = CLASS_ICON_BY_ID[cls.id];
              const barPct = Math.max((cls.winrate / maxWinrate) * 100, 6);

              return (
                <li
                  key={cls.id}
                  data-rank={index + 1}
                  data-tour-id={index === 0 ? 'arena-classes-ranking' : undefined}
                  className="arena-class-row group relative grid items-center gap-2.5 rounded-2xl overflow-hidden cursor-default sm:flex sm:gap-4"
                  style={{
                    background: 'linear-gradient(135deg, #ede0c0 0%, #e2cfa0 50%, #d8c090 100%)',
                    border: '1.5px solid #c9a86c',
                    padding: '10px 14px',
                    gridTemplateColumns: '28px 36px minmax(82px,96px) minmax(0,1fr)',
                  }}
                >
                  <span className="arena-class-rank" aria-label={`Место ${index + 1}`}>{index + 1}</span>
                  {icon && (
                    <img src={icon} alt={cls.name}
                      className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]"
                      draggable={false}
                    />
                  )}

                  <div className="min-w-0 sm:flex-shrink-0 sm:w-40">
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
      {state.status !== 'loading' && <button type="button" className="arena-classes-retry" onClick={onRetry}>
        {state.status === 'error' ? 'Повторить загрузку' : 'Обновить статистику'}
      </button>}
    </section>
  );
}
