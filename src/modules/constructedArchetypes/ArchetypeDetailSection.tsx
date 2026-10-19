import React from 'react';
import { LoadingSurface } from '../../shared/ui/LoadingSurface';
import './ArchetypeDetailSection.css';

export function ArchetypeDetailSection({ title, loading, error, onRetry, children, reserveViewport = false }: React.PropsWithChildren<{
  title: string; loading: boolean; error: string; onRetry: () => void; reserveViewport?: boolean;
}>) {
  return <section aria-label={title} aria-busy={loading} style={{ minHeight: reserveViewport ? '100svh' : 240 }}>
    {loading ? <LoadingSurface label={`Загружаем: ${title.toLocaleLowerCase('ru-RU')}`} />
      : error ? <div role="alert" className="archetype-methodology">
        <div><h2>{title}</h2><p>{error}</p><button type="button" className="archetype-detail-read__retry" onClick={onRetry}>Повторить загрузку</button></div>
      </div> : children}
  </section>;
}
