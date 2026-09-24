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
      { name: 'Классы', href: '/classes' },
    ]} />
    <section aria-label="Описание раздела">
      <p className="text-[#6b4c2a] text-sm leading-relaxed mb-5 px-1"
        style={{ borderLeft: '3px solid #c4a46a', paddingLeft: '12px' }}>
        Винрейт классов на Арене Hearthstone показывает процент побед каждого из 11 классов.
        Данные основаны на миллионах реальных партий и обновляются автоматически каждые 6 часов.
        Рейтинг помогает выбрать лучший класс для драфта на текущем патче.
      </p>
    </section>
    {children}
  </div>;
}

export function ArenaClassesResults({ onNavigate, state, onRetry }: {
  onNavigate: (tab: string) => void;
  state: ArenaClassesState;
  onRetry: () => void;
}) {
  return <>
    <ArenaClassesBoard state={state} onRetry={onRetry} />
    <section aria-label="Смотри также" className="mt-8 pt-4" style={{ borderTop: '1px solid #c4a46a55' }}>
      <p className="text-[#8b6c42] text-xs mb-2 uppercase tracking-wide font-hs">Смотри также</p>
      <div className="flex flex-wrap gap-2">
        {[
          { label: 'Тир-лист карт →', href: '/tierlist', tab: 'tierlist' },
          { label: 'Легендарки →', href: '/legendaries', tab: 'legendaries' },
          { label: 'Статьи о Арене →', href: '/articles', tab: 'articles' },
        ].map(link => <a key={link.href} href={link.href}
          onClick={event => { event.preventDefault(); onNavigate(link.tab); }}
          className="inline-flex min-h-11 items-center px-4 py-2 rounded-lg text-sm font-hs transition-all hover:brightness-110"
          style={{ background: 'linear-gradient(135deg,#ede0c0,#e0cc9e)', border: '1.5px solid #c4a46a', color: '#4a3018', textDecoration: 'none' }}>
          {link.label}
        </a>)}
      </div>
    </section>
  </>;
}
