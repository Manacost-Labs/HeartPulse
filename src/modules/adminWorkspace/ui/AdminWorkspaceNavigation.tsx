import React, { useMemo, useState, type Ref } from 'react';
import { ExternalLink, Search, X } from 'lucide-react';
import type { AdminWorkspaceNavigationItem } from './adminWorkspaceTypes';

export function AdminWorkspaceNavigation<Section extends string>({
  navigation,
  activeSection,
  menuOpen,
  accessLabel,
  navigationRef,
  onCloseMenu,
  onNavigate,
}: {
  navigation: ReadonlyArray<AdminWorkspaceNavigationItem<Section>>;
  activeSection: Section;
  menuOpen: boolean;
  accessLabel: string;
  navigationRef?: Ref<HTMLElement>;
  onCloseMenu: () => void;
  onNavigate: (section: Section) => void;
}) {
  const [query, setQuery] = useState('');
  const filteredNavigation = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ru-RU');
    if (!normalizedQuery) return navigation;
    return navigation.filter(item => [item.label, item.caption, item.group]
      .some(value => value.toLocaleLowerCase('ru-RU').includes(normalizedQuery)));
  }, [navigation, query]);
  const groups = filteredNavigation.reduce<Array<{
    label: string;
    items: Array<AdminWorkspaceNavigationItem<Section>>;
  }>>((result, item) => {
    const previous = result.at(-1);
    if (previous?.label === item.group) previous.items.push(item);
    else result.push({ label: item.group, items: [item] });
    return result;
  }, []);

  return (
    <aside
      ref={navigationRef}
      className={`admin-workspace-nav ${menuOpen ? 'is-open' : ''}`}
      aria-label="Разделы админ панели"
      role={menuOpen ? 'dialog' : undefined}
      aria-modal={menuOpen ? true : undefined}
    >
      <div className="admin-nav-intro">
        <span className="admin-mana-crystal" aria-hidden="true" />
        <div className="admin-nav-intro-copy">
          <strong>Рабочее пространство</strong>
          <span>{accessLabel}</span>
        </div>
        <button type="button" className="admin-nav-close" onClick={onCloseMenu} aria-label="Закрыть меню">
          <X size={20} aria-hidden="true" />
        </button>
      </div>

      <label className="admin-nav-search">
        <span className="sr-only">Найти раздел админ-панели</span>
        <Search size={17} aria-hidden="true" />
        <input
          type="search"
          name="admin-navigation-search"
          value={query}
          placeholder="Найти раздел…"
          aria-label="Найти раздел админ-панели"
          onChange={event => setQuery(event.target.value)}
        />
      </label>

      <nav id="admin-primary-navigation" className="admin-workspace-nav-list">
        {groups.map((group, groupIndex) => {
          const groupId = `admin-nav-group-${groupIndex}`;
          return (
            <section className="admin-nav-cluster" aria-labelledby={groupId} key={group.label}>
              <span className="admin-nav-group" id={groupId}>{group.label}</span>
              {group.items.map(item => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                return (
                  <button
                    type="button"
                    className={active ? 'is-active' : ''}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => {
                      setQuery('');
                      onNavigate(item.id);
                    }}
                    key={item.id}
                  >
                    <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
                    <span><strong>{item.label}</strong><small>{item.caption}</small></span>
                  </button>
                );
              })}
            </section>
          );
        })}
        {!filteredNavigation.length && <p className="admin-nav-empty" role="status">Разделы не найдены.</p>}
      </nav>

      <a className="admin-nav-site-link" href="/" target="_blank" rel="noreferrer">
        <ExternalLink size={18} aria-hidden="true" />
        <span>Открыть публичный сайт</span>
      </a>
    </aside>
  );
}
