import { useRef, useState, type ReactNode } from 'react';

/** Preserves domain-owned sorting and pagination; exports only rendered, accessible rows. */
export function TableSurface({ title, children, imageExport = false, scrollable = true, density = 'comfortable' }: { title: string; children: ReactNode; imageExport?: boolean; scrollable?: boolean; density?: 'comfortable' | 'compact' }) {
  const ref = useRef<HTMLElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const exportTable = async (format: 'csv' | 'svg' | 'png') => {
    const table = ref.current?.querySelector('table');
    if (!table) return;
    setBusy(true); setError('');
    try {
      const exporter = await import('./chartExport');
      if (format === 'csv') exporter.downloadTableCsv(table, title);
      else await exporter.downloadSvgDocument(exporter.tableSvgDocument(table, title), title, format);
    } catch { setError('Не удалось скачать таблицу. Попробуйте ещё раз.'); }
    finally { setBusy(false); }
  };
  return <section ref={ref} className={`analytics-table analytics-table--native analytics-table--${density}`} aria-label={title}>
    <header className="analytics-table__tools"><span>{title} <small>· текущие строки</small></span><span className="analytics-chart__downloads">
      {(imageExport ? ['csv', 'png', 'svg'] as const : ['csv'] as const).map(format => <button key={format} type="button" disabled={busy} aria-label={`Скачать ${title}: ${format.toUpperCase()}`} onClick={() => void exportTable(format)}>{format.toUpperCase()}</button>)}
    </span></header>
    <div className={scrollable ? 'analytics-table__scroll' : 'analytics-table__content'} role={scrollable ? 'region' : undefined} aria-label={scrollable ? `Таблица: ${title}` : undefined} tabIndex={scrollable ? 0 : undefined}>{children}</div>
    {error && <p className="analytics-chart__error" role="alert">{error}</p>}
  </section>;
}
