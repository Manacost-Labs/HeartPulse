import type { ReactNode } from 'react';
import { LoadingKpiStrip } from '../../shared/ui/LoadingShapes';
import { ViciousGoldSkeleton } from './ViciousGoldSkeleton';

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

/** The statistics' place under the banner: the access check and the first load share it. */
export function ViciousGoldLoading() {
  return <ViciousGoldSkeleton />;
}

/** The banner's two totals while the report loads: their labels and value placeholders (PublicPageBanner.css). */
export function ViciousGoldSummaryLoading() {
  return <LoadingKpiStrip className="traditional-mode-banner__summary" labels={['Партий', 'Окно данных']} wide />;
}
