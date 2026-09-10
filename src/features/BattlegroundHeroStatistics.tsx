import { useId, useRef, useState, type ReactNode } from 'react';
import './BattlegroundHeroStatistics.css';

const TABS = [
  { id: 'overview', label: 'Обзор', tourId: 'bg-hero-detail-placement' },
  { id: 'power', label: 'Сила героя', tourId: 'bg-hero-detail-tables' },
  { id: 'tavern', label: 'Таверна', tourId: undefined },
  { id: 'compositions', label: 'Составы', tourId: 'bg-hero-detail-compositions' },
] as const;
type TabId = typeof TABS[number]['id'];

/** Retain each data view, but expose only the selected section to layout and focus. */
export function BattlegroundHeroStatistics({ overview, power, tavern, compositions }: Record<TabId, ReactNode>) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const id = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const panels = { overview, power, tavern, compositions };
  return (
    <section className="bg-hero-statistics" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} className="font-hs text-xl">Статистика героя</h2>
      <div role="tablist" aria-label="Статистика героя" className="bg-hero-statistics__tabs">
        {TABS.map((tab, index) => (
          <button
            key={tab.id} ref={element => { tabRefs.current[index] = element; }}
            type="button" role="tab" id={`${id}-${tab.id}-tab`}
            aria-selected={activeTab === tab.id} aria-controls={`${id}-${tab.id}-panel`}
            tabIndex={activeTab === tab.id ? 0 : -1} data-stat-tab={tab.label} data-tour-id={tab.tourId}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={event => {
              const destinations: Record<string, number> = {
                ArrowRight: (index + 1) % TABS.length,
                ArrowLeft: (index + TABS.length - 1) % TABS.length,
                Home: 0,
                End: TABS.length - 1,
              };
              const nextIndex = destinations[event.key];
              if (nextIndex === undefined) return;
              event.preventDefault();
              setActiveTab(TABS[nextIndex].id);
              tabRefs.current[nextIndex]?.focus();
            }}
          >{tab.label}</button>
        ))}
      </div>
      {TABS.map(tab => (
        <div key={tab.id} role="tabpanel" id={`${id}-${tab.id}-panel`}
          aria-labelledby={`${id}-${tab.id}-tab`} hidden={activeTab !== tab.id} tabIndex={0}>
          <div className="bg-hero-statistics__content">{panels[tab.id] ?? <p>Для этого раздела пока нет статистики.</p>}</div>
        </div>
      ))}
    </section>
  );
}
