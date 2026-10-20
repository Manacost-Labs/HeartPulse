import React from 'react';
import { LoadingSurface } from '../../shared/ui/LoadingSurface';
import '../../shared/ui/LoadingSurface.css';
import './ArchetypeDetailSection.css';

/**
 * One independently loaded part of the archetype page. A load swaps in a
 * placeholder rather than refreshing visible content, so the section is never
 * `aria-busy`, which would hold back the placeholder's status. `skeleton` is
 * the owner's fitted LoadingSurface (it carries that single status); without
 * one a generic panel stands in.
 */
export function ArchetypeDetailSection({ title, loading, error, onRetry, children, reserveViewport = false, skeleton }: React.PropsWithChildren<{
  title: string; loading: boolean; error: string; onRetry: () => void; reserveViewport?: boolean; skeleton?: React.ReactNode;
}>) {
  return <section aria-label={title} data-loading={loading ? 'true' : undefined} style={{ minHeight: reserveViewport ? '100svh' : 240 }}>
    {loading ? skeleton ?? <LoadingSurface label={`Загружаем: ${title.toLocaleLowerCase('ru-RU')}`} />
      : error ? <div role="alert" className="archetype-methodology">
        <div><h2>{title}</h2><p>{error}</p><button type="button" className="archetype-detail-read__retry" onClick={onRetry}>Повторить загрузку</button></div>
      </div> : children}
  </section>;
}
