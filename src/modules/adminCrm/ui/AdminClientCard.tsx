import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarClock, Copy, RefreshCw, X } from 'lucide-react';
import { adminCrmClient, type AdminCrmClient, type AdminCrmPerson } from '../api/adminCrmClient';
import '../adminCrm.css';
import { accessBadge, accessSourceLabel, formatDate } from './adminClientCardModel';
import { AccessSection, AccountsSection, HistorySection, NotesSection, TagsSection } from './AdminClientCardSections';
import { useModalSheet } from './useModalSheet';

export type AdminClientCardProps = {
  userId: string;
  client?: Pick<AdminCrmClient, 'person' | 'addNote' | 'deleteNote' | 'setTags'>;
  onClose: () => void;
  /** Opens the existing manual-access dialog for this person. */
  onManageAccess?: () => void;
  /** Called after notes or tags change so the list can refresh its row. */
  onChanged?: () => void;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; card: AdminCrmPerson };

function usePersonCard(client: Pick<AdminCrmClient, 'person'>, userId: string) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    // A refresh after a note or tag change keeps the current card on screen instead of flashing a loader.
    setState(current => (current.status === 'ready' && current.card.person.id === userId ? current : { status: 'loading' }));
    client.person(userId, controller.signal)
      .then(card => setState({ status: 'ready', card }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'error', message: error instanceof Error ? error.message : 'Не удалось загрузить карточку' });
      });
    return () => controller.abort();
  }, [client, userId, reloadKey]);
  const reload = useCallback(() => setReloadKey(key => key + 1), []);
  return { state, reload };
}

export function AdminClientCard({ userId, client = adminCrmClient, onClose, onManageAccess, onChanged }: AdminClientCardProps) {
  const titleId = useId();
  const sheetRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const { state, reload } = usePersonCard(client, userId);
  const [busy, setBusy] = useState('');
  const [actionError, setActionError] = useState('');
  const [copied, setCopied] = useState(false);
  useModalSheet(sheetRef, closeRef, onClose);

  const run = async (key: string, work: () => Promise<unknown>): Promise<boolean> => {
    setBusy(key);
    setActionError('');
    try {
      await work();
      reload();
      onChanged?.();
      return true;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Действие не выполнено');
      return false;
    } finally {
      setBusy('');
    }
  };

  const card = state.status === 'ready' ? state.card : null;
  const badge = card ? accessBadge(card) : null;
  const copyId = (id: string) => navigator.clipboard?.writeText(id)
    .then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); })
    .catch(() => undefined);

  // Portalled to <body> so route transitions that transform an ancestor cannot re-anchor the fixed sheet.
  // The card only opens from a click, so there is no server render; the guard keeps SSR safe regardless.
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="admin-crm-sheet-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <aside ref={sheetRef} className="admin-crm-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={state.status === 'loading'}>
        <header className="admin-crm-sheet-head">
          <div className="admin-crm-avatar" aria-hidden="true">{card ? (card.person.name || card.person.email || '?').trim().slice(0, 1).toUpperCase() : '…'}</div>
          <div className="admin-crm-identity">
            <h2 id={titleId}>{card ? card.person.name || card.person.email || card.person.id : 'Карточка пользователя'}</h2>
            {card && (
              <p>
                <button type="button" className="admin-crm-copy" onClick={() => void copyId(card.person.id)}>ID {card.person.id} <Copy size={12} aria-hidden="true" /></button>
                {card.person.email && <span> · {card.person.email}</span>}
                {copied && <span role="status"> · скопировано</span>}
              </p>
            )}
          </div>
          <button ref={closeRef} type="button" className="admin-crm-close" aria-label="Закрыть карточку" onClick={onClose}><X size={20} /></button>
        </header>

        {state.status === 'loading' && <p className="admin-crm-state" role="status">Загружаем карточку…</p>}
        {state.status === 'error' && (
          <div className="admin-crm-state" role="alert">
            <p>{state.message}</p>
            <button type="button" className="contest-secondary-button" onClick={reload}><RefreshCw size={16} /> Повторить</button>
          </div>
        )}

        {card && badge && (
          <div className="admin-crm-sheet-body">
            <div className="admin-crm-summary">
              <span className={`admin-crm-pill is-${badge.tone}`}>{badge.text}</span>
              <span className="admin-crm-chip">{accessSourceLabel(card.access.source)}</span>
              {card.person.role === 'admin' && <span className="admin-crm-chip">администратор</span>}
              <span className="admin-crm-chip">с {formatDate(card.person.createdAt)}</span>
            </div>
            {onManageAccess && (
              <div className="admin-crm-actions">
                <button type="button" className="contest-primary-button" onClick={onManageAccess}>
                  <CalendarClock size={16} aria-hidden="true" /> {card.access.manual?.active ? 'Изменить доступ' : 'Выдать доступ'}
                </button>
              </div>
            )}
            {actionError && <p className="admin-crm-error" role="alert">{actionError}</p>}
            <AccessSection idPrefix={titleId} card={card} />
            <TagsSection idPrefix={titleId} card={card} busy={Boolean(busy)} onSave={tags => void run('tags', () => client.setTags(userId, tags))} />
            <NotesSection
              idPrefix={titleId}
              card={card}
              busy={busy}
              onAdd={body => run('note', () => client.addNote(userId, body))}
              onDelete={note => void run(`note-${note.id}`, () => client.deleteNote(userId, note.id))}
            />
            <AccountsSection idPrefix={titleId} card={card} />
            <HistorySection idPrefix={titleId} card={card} />
          </div>
        )}
      </aside>
    </div>,
    document.body,
  );
}
