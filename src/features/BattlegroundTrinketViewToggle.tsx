import type { TrinketView } from './battlegroundTrinkets';

const VIEW_OPTIONS: ReadonlyArray<{ id: TrinketView; label: string; icon: string }> = [
  { id: 'gallery', label: 'Галерея', icon: '/assets/battlegrounds/trinket-view-gallery.png' },
  { id: 'table', label: 'Таблица', icon: '/assets/battlegrounds/trinket-view-table.png' },
];

/** Accessible view switch that preserves the supplied Hearthstone controls. */
export function BattlegroundTrinketViewToggle({
  value,
  onChange,
}: {
  value: TrinketView;
  onChange: (view: TrinketView) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[#334155]">Вид</legend>
      <div className="bg-trinket-view-toggle" aria-label="Режим отображения аксессуаров">
        {VIEW_OPTIONS.map(option => (
          <button
            key={option.id}
            type="button"
            aria-label={option.label}
            aria-pressed={value === option.id}
            title={option.label}
            onClick={() => onChange(option.id)}
          >
            <img src={option.icon} alt="" width={44} height={42} />
          </button>
        ))}
      </div>
    </fieldset>
  );
}
