import { useCallback, useEffect, useState } from 'react';
import type { AdminMessage } from './adminWorkspaceState';

const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

export type AdminContentList<Item> = {
  items: Item[];
  /** True until the first response arrives. */
  loading: boolean;
  /** The list could not be loaded; shown instead of an empty state. */
  loadError: string;
  /** Key of the action in progress (`save`, `delete:<id>`), or an empty string. */
  busy: string;
  reload: () => Promise<void>;
  /**
   * Runs a change, reports success in the admin toast and refreshes the list. Resolves to an error text or ''.
   * A sheet shows its own error inline, so it passes `toastError: false` to keep the toast off its buttons.
   */
  run: (key: string, work: () => Promise<unknown>, okText: string, toastError?: boolean) => Promise<string>;
};

/** Loading, refreshing and mutating one admin content list (articles or gallery items). */
export function useAdminContentList<Item>(load: () => Promise<Item[]>, onMessage: (message: AdminMessage | null) => void): AdminContentList<Item> {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState('');

  const reload = useCallback(async () => {
    try {
      setItems(await load());
      setLoadError('');
    } catch (error) {
      setLoadError(errorText(error, 'Не удалось загрузить список'));
    } finally {
      setLoading(false);
    }
  }, [load]);

  useEffect(() => { void reload(); }, [reload]);

  const run = useCallback(async (key: string, work: () => Promise<unknown>, okText: string, toastError = true) => {
    setBusy(key);
    onMessage(null);
    try {
      await work();
      onMessage({ type: 'ok', text: okText });
      await reload();
      return '';
    } catch (error) {
      const text = errorText(error, 'Действие не выполнено');
      if (toastError) onMessage({ type: 'err', text });
      return text;
    } finally {
      setBusy('');
    }
  }, [onMessage, reload]);

  return { items, loading, loadError, busy, reload, run };
}
