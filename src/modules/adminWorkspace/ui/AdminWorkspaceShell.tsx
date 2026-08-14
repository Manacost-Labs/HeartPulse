import React, { type ReactNode, type Ref } from 'react';
import { ExternalLink, Menu, X } from 'lucide-react';

export type AdminWorkspaceNavigationItem<Section extends string = string> = {
  id: Section;
  label: string;
  caption: string;
  status: string;
  group: string;
  icon: React.ElementType;
};

export type AdminWorkspaceShellMessage = {
  type: 'ok' | 'err';
  text: string;
};

export type AdminWorkspaceShellProps<Section extends string = string> = {
  navigation: ReadonlyArray<AdminWorkspaceNavigationItem<Section>>;
  activeSection: Section;
  menuOpen: boolean;
  accessLabel: string;
  userLabel: string;
  userTitle?: string;
  message: AdminWorkspaceShellMessage | null;
  menuButtonRef?: Ref<HTMLButtonElement>;
  navigationRef?: Ref<HTMLElement>;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onNavigate: (section: Section) => void;
  onDismissMessage: () => void;
  children: ReactNode;
};

export function AdminWorkspaceShell<Section extends string>({
  navigation,
  activeSection,
  menuOpen,
  accessLabel,
  userLabel,
  userTitle,
  message,
  menuButtonRef,
  navigationRef,
  onToggleMenu,
  onCloseMenu,
  onNavigate,
  onDismissMessage,
  children,
}: AdminWorkspaceShellProps<Section>) {
  const activeItem = navigation.find(item => item.id === activeSection) ?? navigation[0];
  const userInitial = userLabel.trim().charAt(0).toLocaleUpperCase('ru-RU') || 'A';
  const navigationGroups = navigation.reduce<Array<{
    label: string;
    items: Array<AdminWorkspaceNavigationItem<Section>>;
  }>>((groups, item) => {
    const previous = groups.at(-1);
    if (previous?.label === item.group) {
      previous.items.push(item);
    } else {
      groups.push({ label: item.group, items: [item] });
    }
    return groups;
  }, []);

  return (
    <section className="contest-admin-page admin-workspace-page admin-tailadmin-shell">
      <header
        className="admin-command-bar"
        aria-label="Панель управления"
        inert={menuOpen ? true : undefined}
      >
        <button
          ref={menuButtonRef}
          type="button"
          className="admin-menu-toggle"
          onClick={onToggleMenu}
          aria-expanded={menuOpen}
          aria-controls="admin-primary-navigation"
          aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
        >
          {menuOpen ? <X size={21} aria-hidden="true" /> : <Menu size={21} aria-hidden="true" />}
        </button>

        <a href="/" className="admin-command-brand" aria-label="Manacost Admin — открыть сайт">
          <span className="admin-command-logo" aria-hidden="true" />
          <span className="admin-command-name">Manacost</span>
          <em>Admin</em>
        </a>

        <div className="admin-command-actions">
          <span className="admin-system-pulse"><i />Доступ подтверждён</span>
          <a href="/" target="_blank" rel="noreferrer">
            Открыть сайт <ExternalLink size={16} aria-hidden="true" />
          </a>
          <span className="admin-user-chip" title={userTitle}>
            <b aria-hidden="true">{userInitial}</b>
            <span>{userLabel}</span>
          </span>
        </div>
      </header>

      {message && (
        <div
          className={`contest-message contest-message-${message.type} admin-toast`}
          role={message.type === 'err' ? 'alert' : 'status'}
          aria-live="polite"
          inert={menuOpen ? true : undefined}
        >
          <span>{message.text}</span>
          <button type="button" onClick={onDismissMessage} aria-label="Закрыть уведомление">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="admin-workspace-layout">
        {menuOpen && (
          <div
            className="admin-nav-backdrop"
            onClick={onCloseMenu}
            aria-hidden="true"
          />
        )}

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
            <button
              type="button"
              className="admin-nav-close"
              onClick={onCloseMenu}
              aria-label="Закрыть меню"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>

          <nav id="admin-primary-navigation" className="admin-workspace-nav-list">
            {navigationGroups.map((group, groupIndex) => {
              const groupId = `admin-nav-group-${groupIndex}`;
              return (
                <div className="admin-nav-cluster" role="group" aria-labelledby={groupId} key={group.label}>
                  <span className="admin-nav-group" id={groupId}>{group.label}</span>
                  {group.items.map(item => {
                    const Icon = item.icon;
                    const active = activeSection === item.id;
                    return (
                      <button
                        type="button"
                        className={active ? 'is-active' : ''}
                        aria-current={active ? 'page' : undefined}
                        onClick={() => onNavigate(item.id)}
                        key={item.id}
                      >
                        <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
                        <span>
                          <strong>{item.label}</strong>
                          <small>{item.caption}</small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </nav>

          <a className="admin-nav-site-link" href="/" target="_blank" rel="noreferrer">
            <ExternalLink size={18} aria-hidden="true" />
            <span>Открыть публичный сайт</span>
          </a>
        </aside>

        <div
          className="admin-workspace-content"
          id={`admin-section-${activeSection}`}
          role="region"
          aria-labelledby="admin-section-title"
          inert={menuOpen ? true : undefined}
        >
          <div className="admin-section-header">
            <div>
              <span>Manacost / Админка</span>
              <h1 id="admin-section-title">{activeItem?.label ?? 'Админка'}</h1>
              <p>{activeItem?.caption ?? 'Управление проектом'}</p>
            </div>
            {activeItem && <div className="admin-section-status"><i />{activeItem.status}</div>}
          </div>
          {children}
        </div>
      </div>
    </section>
  );
}
