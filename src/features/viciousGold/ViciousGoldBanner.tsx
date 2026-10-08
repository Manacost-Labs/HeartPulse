import type { ReactNode } from 'react';
import { LoadingSurface } from '../../shared/ui/LoadingSurface';
import { formatDate } from './viciousGoldModel';

/** The page banner. Access checks, guests, loading and statistics share it, so the title never moves between them. */
export function ViciousGoldBanner({ source, children }: {
  source?: { url: string; updatedAt: string | null };
  children?: ReactNode;
}) {
  return (
    <header className="traditional-mode-banner">
      <div className="traditional-mode-banner__copy">
        <h1>Vicious Syndicate Gold</h1>
        <p>Расширенная статистика меты: популярность, готовые сборки и Power Tier.</p>
        {source && <p className="vsgold__freshness">
          Данные {source.url ? <a href={source.url} target="_blank" rel="noreferrer">Vicious Syndicate Live</a> : 'Vicious Syndicate Live'}
          {source.updatedAt && `, обновлено ${formatDate(source.updatedAt)}`}
        </p>}
      </div>
      {children}
    </header>
  );
}

export function ViciousGoldLoading() {
  return <LoadingSurface label="Загружаем Vicious Syndicate Gold" detail="Собираем распределения, Power Tier и коды колод."
    layout="rows" count={5} className="vsgold__loading" />;
}
