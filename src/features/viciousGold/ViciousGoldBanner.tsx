import type { ReactNode } from 'react';
import { LoadingSurface } from '../../shared/ui/LoadingSurface';

/** The page banner. Access checks, guests, loading and statistics share it, so the title never moves between them. */
export function ViciousGoldBanner({ children }: {
  children?: ReactNode;
}) {
  return (
    <header className="traditional-mode-banner">
      <div className="traditional-mode-banner__copy">
        <h1>Vicious Syndicate Gold</h1>
        <p>Расширенная статистика меты: популярность, готовые сборки и Power Tier.</p>
      </div>
      {children}
    </header>
  );
}

export function ViciousGoldLoading() {
  return <LoadingSurface label="Загружаем Vicious Syndicate Gold" detail="Собираем распределения, Power Tier и коды колод."
    layout="rows" count={5} className="vsgold__loading" />;
}
