import { useId, useRef, useState, type ReactNode } from 'react';
import { FileCode2, ImageDown } from 'lucide-react';

const EXPORTS = [{ format: 'png', Icon: ImageDown }, { format: 'svg', Icon: FileCode2 }] as const;

export function ChartFrame({ title, subtitle, children, actions, tourId, className = '', exportable = true }: {
  title: string; subtitle?: string; children: ReactNode; actions?: ReactNode; tourId?: string; className?: string; exportable?: boolean;
}) {
  const id = useId();
  const ref = useRef<HTMLElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const exportChart = async (format: 'svg' | 'png') => {
    const svg = ref.current?.querySelector('svg[data-chart]');
    if (!(svg instanceof SVGSVGElement)) { setError('Для скачивания нужны данные графика.'); return; }
    setBusy(true);
    setError('');
    try {
      const { downloadChart } = await import('./chartExport');
      const observation = ref.current?.querySelector('output, .analytics-chart__note')?.textContent ?? '';
      await downloadChart(svg, title, format, [subtitle, observation].filter(Boolean).join(' · '));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось скачать график. Попробуйте ещё раз.');
    } finally { setBusy(false); }
  };
  return <section ref={ref} className={`analytics-chart ${className}`} aria-labelledby={id} data-tour-id={tourId}>
    <header className="analytics-chart__header">
      <div><h3 id={id}>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>
      <div className="analytics-chart__actions">{actions}<span className="analytics-chart__downloads">
        {EXPORTS.map(({ format, Icon }) => <button key={format} type="button" className="analytics-chart__download" disabled={busy || !exportable} onClick={() => void exportChart(format)}
          aria-label={`Скачать ${title}: ${format.toUpperCase()}`} title={`Скачать ${format.toUpperCase()}`}><Icon size={16} aria-hidden="true" /></button>)}
      </span></div>
    </header>
    {children}
    {error && <p role="alert" className="analytics-chart__error">{error}</p>}
  </section>;
}
