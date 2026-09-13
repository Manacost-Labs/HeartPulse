import React, { type Ref } from 'react';
import { ExternalLink, Menu, X } from 'lucide-react';

export function AdminCommandBar({
  menuOpen,
  menuButtonRef,
  userLabel,
  userTitle,
  onToggleMenu,
}: {
  menuOpen: boolean;
  menuButtonRef?: Ref<HTMLButtonElement>;
  userLabel: string;
  userTitle?: string;
  onToggleMenu: () => void;
}) {
  const userInitial = userLabel.trim().charAt(0).toLocaleUpperCase('ru-RU') || 'A';

  return (
    <header className="admin-command-bar" aria-label="Панель управления" inert={menuOpen ? true : undefined}>
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

      <a href="/" className="admin-command-brand" aria-label="HearthPulse Admin — открыть сайт">
        <img className="admin-command-logo" src="/arena-logo-icon-256.webp" alt="" />
        <span className="admin-command-name">HearthPulse</span>
      </a>

      <div className="admin-command-actions">
        <a
          href="/"
          className="admin-public-site-link"
          target="_blank"
          rel="noreferrer"
          aria-label="Открыть публичный сайт HearthPulse"
        >
          <span>Сайт</span>
          <ExternalLink size={15} aria-hidden="true" />
        </a>
        <span className="admin-user-chip" title={userTitle}>
          <b aria-hidden="true">{userInitial}</b>
          <span>{userLabel}</span>
        </span>
      </div>
    </header>
  );
}
