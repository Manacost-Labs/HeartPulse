import React from 'react';
import { ChevronRight, Search, X } from 'lucide-react';
import { AppShellSidebarToggle } from '../../vendor/valyro-ui/layout/AppShell';
import type { AdminMessage } from '../adminWorkspaceState';
import type { AdminNavigationItem } from './adminNavigation';

/** Top bar of the console: sidebar toggle, the group › section path, section search and the operator. */
export function ConsoleTopBar({ active, userLabel, userTitle, onSearch }: {
  active: AdminNavigationItem | undefined;
  userLabel: string;
  userTitle?: string;
  onSearch: () => void;
}) {
  return (
    <div className="admin-console-header">
      <AppShellSidebarToggle variant="ghost" />
      <nav className="admin-console-crumbs" aria-label="Расположение">
        <span>{active?.group ?? 'Админка'}</span>
        <ChevronRight size={14} aria-hidden="true" />
        <span aria-current="page">{active?.label ?? 'Админка'}</span>
      </nav>
      <div className="admin-console-header__actions">
        <button type="button" className="admin-console-search" aria-keyshortcuts="Control+K Meta+K" onClick={onSearch}>
          <Search size={16} aria-hidden="true" />
          <span>Найти раздел</span>
          <kbd aria-hidden="true">Ctrl K</kbd>
        </button>
        <span className="admin-console-user" title={userTitle}>
          <span className="admin-console-user__avatar" aria-hidden="true">{(userLabel.trim()[0] || 'A').toUpperCase()}</span>
          <span className="admin-console-user__name">{userLabel}</span>
        </span>
      </div>
    </div>
  );
}

/** The console's single notice; errors stay until dismissed, the panel clears successes on its own. */
export function ConsoleToast({ message, onDismiss }: { message: AdminMessage; onDismiss: () => void }) {
  return (
    <div className={`admin-toast is-${message.type}`} role={message.type === 'err' ? 'alert' : 'status'} aria-live="polite">
      <span>{message.text}</span>
      <button type="button" onClick={onDismiss} aria-label="Закрыть уведомление">
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
