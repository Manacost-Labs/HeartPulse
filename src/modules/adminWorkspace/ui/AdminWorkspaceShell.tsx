import React from 'react';
import { X } from 'lucide-react';
import { AdminCommandBar } from './AdminCommandBar';
import { AdminWorkspaceNavigation } from './AdminWorkspaceNavigation';
import type { AdminWorkspaceShellProps } from './adminWorkspaceTypes';

export type {
  AdminWorkspaceNavigationItem,
  AdminWorkspaceShellMessage,
  AdminWorkspaceShellProps,
} from './adminWorkspaceTypes';

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

  return (
    <section className="contest-admin-page admin-workspace-page admin-tailadmin-shell">
      <AdminCommandBar
        menuOpen={menuOpen}
        menuButtonRef={menuButtonRef}
        userLabel={userLabel}
        userTitle={userTitle}
        onToggleMenu={onToggleMenu}
      />

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

        <AdminWorkspaceNavigation
          navigation={navigation}
          activeSection={activeSection}
          menuOpen={menuOpen}
          accessLabel={accessLabel}
          navigationRef={navigationRef}
          onCloseMenu={onCloseMenu}
          onNavigate={onNavigate}
        />

        <div
          className="admin-workspace-content"
          id={`admin-section-${activeSection}`}
          role="region"
          aria-labelledby="admin-section-title"
          inert={menuOpen ? true : undefined}
        >
          <div className="admin-section-header">
            <div>
              <span>HearthPulse / Админка</span>
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
