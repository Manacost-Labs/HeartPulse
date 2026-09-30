import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import '../adminCrm.css';
import { useModalSheet } from './useModalSheet';

export type AdminSheetProps = {
  title: string;
  description?: React.ReactNode;
  closeLabel?: string;
  busy?: boolean;
  /** Selector of the control that takes focus on open; the close button by default. */
  initialFocus?: string;
  /** Asked before the sheet closes; an editor uses it to confirm discarding unsaved input. */
  onClose: () => void;
  children: React.ReactNode;
};

/** A modal side sheet for admin forms, with the same focus, Escape and scroll-lock contract as the client card. */
export function AdminSheet({ title, description, closeLabel = 'Закрыть', busy = false, initialFocus, onClose, children }: AdminSheetProps) {
  const titleId = useId();
  const sheetRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useModalSheet(sheetRef, closeRef, onClose);
  // Runs after the modal setup above, so a form can start in its first field.
  useEffect(() => {
    if (initialFocus) sheetRef.current?.querySelector<HTMLElement>(initialFocus)?.focus();
  }, [initialFocus]);

  // Portalled to <body> so route transitions that transform an ancestor cannot re-anchor the fixed sheet.
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="admin-crm-sheet-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <aside ref={sheetRef} className="admin-crm-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy}>
        <header className="admin-crm-sheet-head is-plain">
          <div className="admin-crm-identity">
            <h2 id={titleId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button ref={closeRef} type="button" className="admin-crm-close" aria-label={closeLabel} onClick={onClose}><X size={20} /></button>
        </header>
        <div className="admin-crm-sheet-body">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}
