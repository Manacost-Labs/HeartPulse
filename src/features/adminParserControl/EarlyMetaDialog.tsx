import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { toDateTimeLocal } from './format';

export function EarlyMetaDialog({
  open,
  initialUntil,
  initialReason,
  capableSources,
  saving,
  onClose,
  onConfirm,
}: {
  open: boolean;
  initialUntil: string | null;
  initialReason: string;
  capableSources: number;
  saving: boolean;
  onClose: () => void;
  onConfirm: (earlyUntil: string, reason: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const [earlyUntil, setEarlyUntil] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      restoreFocusRef.current = document.activeElement as HTMLElement | null;
      setEarlyUntil(toDateTimeLocal(initialUntil));
      setReason(initialReason);
      dialog.showModal();
      window.requestAnimationFrame(() => reasonRef.current?.focus());
    } else if (!open && dialog.open) {
      dialog.close();
      window.requestAnimationFrame(() => restoreFocusRef.current?.focus());
    }
  }, [initialReason, initialUntil, open]);

  const close = () => {
    if (saving) return;
    if (dialogRef.current?.open) dialogRef.current.close();
    onClose();
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = new Date(earlyUntil);
    if (!Number.isFinite(parsed.getTime()) || parsed.getTime() <= Date.now() || reason.trim().length < 3) return;
    onConfirm(parsed.toISOString(), reason.trim());
  };

  return (
    <dialog
      ref={dialogRef}
      className="admin-parser-dialog"
      aria-labelledby="early-meta-dialog-title"
      onCancel={event => { event.preventDefault(); close(); }}
      onClose={() => { if (open && !saving) onClose(); }}
    >
      <form onSubmit={submit}>
        <div className="admin-parser-dialog__head">
          <div>
            <span>Режим публикации</span>
            <h3 id="early-meta-dialog-title">Включить раннюю мету</h3>
          </div>
          <button type="button" aria-label="Закрыть окно" disabled={saving} onClick={close}><X size={20} /></button>
        </div>
        <div className="admin-parser-dialog__notice">
          <AlertTriangle size={20} aria-hidden="true" />
          <p>Первые корректные данные будут публиковаться с предупреждением. Режим затронет только {capableSources} источников, которые его поддерживают.</p>
        </div>
        <label>
          Причина переключения
          <textarea
            ref={reasonRef}
            required
            minLength={3}
            maxLength={300}
            rows={3}
            value={reason}
            placeholder="Например: балансный патч 21 июля"
            onChange={event => setReason(event.target.value)}
          />
        </label>
        <label>
          Автоматически вернуть стабильный режим
          <input
            type="datetime-local"
            required
            min={toDateTimeLocal(new Date(Date.now() + 5 * 60_000).toISOString())}
            value={earlyUntil}
            onChange={event => setEarlyUntil(event.target.value)}
          />
        </label>
        <p className="admin-parser-dialog__hint">Стабильные снимки сохраняются отдельно. Ошибочный или пустой результат не заменит корректные данные.</p>
        <div className="admin-parser-dialog__actions">
          <button type="button" className="contest-secondary-button" disabled={saving} onClick={close}>Отмена</button>
          <button type="submit" className="contest-primary-button" disabled={saving || reason.trim().length < 3 || !earlyUntil}>
            {saving ? 'Сохраняем…' : 'Включить раннюю мету'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
