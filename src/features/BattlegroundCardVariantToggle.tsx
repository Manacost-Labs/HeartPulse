import { Layers3, Sparkles } from 'lucide-react';
import { useId } from 'react';

export type BattlegroundCardVariant = 'normal' | 'golden';

interface CardStats {
  attack?: number | null;
  health?: number | null;
}

interface BattlegroundCardVariantToggleProps {
  value: BattlegroundCardVariant;
  normalStats?: CardStats;
  goldenStats?: CardStats;
  onChange: (variant: BattlegroundCardVariant) => void;
}

function statsLabel(stats?: CardStats): string | null {
  if (stats?.attack == null || stats.health == null) return null;
  return `${stats.attack}/${stats.health}`;
}

export default function BattlegroundCardVariantToggle({
  value,
  normalStats,
  goldenStats,
  onChange,
}: BattlegroundCardVariantToggleProps) {
  const labelId = useId();
  const options = [
    { value: 'normal' as const, label: 'Обычная', icon: Layers3, stats: normalStats },
    { value: 'golden' as const, label: 'Золотая', icon: Sparkles, stats: goldenStats },
  ];

  return (
    <div className="mt-3 w-full rounded-lg border border-[#b78845] bg-[#fff7dc]/95 p-1.5 shadow-[0_8px_18px_rgba(65,38,16,0.12)]">
      <p id={labelId} className="sr-only">Версия карты</p>
      <div role="group" aria-labelledby={labelId} className="grid grid-cols-2 gap-1.5">
        {options.map(option => {
          const selected = option.value === value;
          const Icon = option.icon;
          const stats = statsLabel(option.stats);
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              style={{ color: selected ? '#fff4d2' : '#57391f' }}
              className={`inline-flex min-h-12 min-w-0 items-center justify-center gap-1 rounded-md border px-1.5 py-2 text-sm font-semibold transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6b3b79] sm:gap-2 sm:px-3 sm:text-base ${
                selected
                  ? 'border-[#72212a] bg-[#72212a] text-[#fff4d2] shadow-sm'
                  : 'border-[#d3b274] bg-[#fffdf3] text-[#57391f] hover:border-[#9c6c32] hover:bg-[#fff2c5]'
              }`}
            >
              <Icon aria-hidden="true" size={18} strokeWidth={2.2} />
              <span className="whitespace-nowrap" style={{ color: 'inherit' }}>{option.label}</span>
              {stats ? (
                <>
                  <span
                    aria-hidden="true"
                    style={{ color: 'inherit' }}
                    className={`rounded-full px-1.5 py-0.5 text-sm tabular-nums sm:px-2 ${selected ? 'bg-black/20' : 'bg-[#ead5a7]'}`}
                  >
                    {stats}
                  </span>
                  <span className="sr-only">
                    {option.stats?.attack} атаки, {option.stats?.health} здоровья
                  </span>
                </>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
