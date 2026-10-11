import type { ReactNode } from 'react';
import { Breadcrumbs, SectionBanner } from '../../../shared/ui/EditorialRouteChrome';
import type { ArenaClassesState } from '../model/state';
import { ArenaClassesBoard } from './ArenaClassesBoard';

export type ArenaClassesPageProps = {
  onNavigate: (tab: string) => void;
  children: ReactNode;
};

export function ArenaClassesPage({ onNavigate, children }: ArenaClassesPageProps) {
  return <div className="arena-classes-page">
    <SectionBanner title="Классы" subtitle="Статистика побед на Арене — текущий патч" />
    <Breadcrumbs items={[
      { name: 'Главная', href: '/', onClick: () => onNavigate('home') },
      { name: 'Классы', href: '/classes/' },
    ]} />
    {children}
  </div>;
}

export function ArenaClassesResults({ state, onRetry }: {
  state: ArenaClassesState;
  onRetry: () => void;
}) {
  return <ArenaClassesBoard state={state} onRetry={onRetry} />;
}
