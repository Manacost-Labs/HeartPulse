import { useCallback, useState } from 'react';
import { invalidateAdminResources, useAdminResource } from '../modules/adminWorkspace/public';
import type { AdminMessage } from './adminWorkspaceState';

const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

const sourceIds = new WeakMap<object, number>();
let lastSourceId = 0;

/**
 * Cache key of one request function. Sections receive their client as a prop (stories pass fakes),
 * so the key follows the function rather than a URL; the production client keeps one key per tab.
 */
export function useAdminSourceKey(source: () => Promise<unknown>, name: string): string {
  const [key] = useState(() => {
    let id = sourceIds.get(source);
    if (id === undefined) {
      lastSourceId += 1;
      id = lastSourceId;
      sourceIds.set(source, id);
    }
    return `admin-content:${id}:${name}`;
  });
  return key;
}

export type AdminContentList<Item> = {
  /** Cache key of the list; related answers use it as their prefix (`${key}:reads`). */
  key: string;
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

const NO_ITEMS: never[] = [];

/**
 * Loading, refreshing and mutating one admin content list (articles or gallery items). The list is
 * cached per tab, so returning to the section shows it at once and refreshes it in the background.
 */
export function useAdminContentList<Item>(load: () => Promise<Item[]>, onMessage: (message: AdminMessage | null) => void, name = 'list'): AdminContentList<Item> {
  const key = useAdminSourceKey(load, name);
  const resource = useAdminResource(key, load);
  const [busy, setBusy] = useState('');
  const { reload } = resource;

  const run = useCallback(async (actionKey: string, work: () => Promise<unknown>, okText: string, toastError = true) => {
    setBusy(actionKey);
    onMessage(null);
    try {
      await work();
      onMessage({ type: 'ok', text: okText });
      await reload();
      // Secondary answers about the same items (e.g. read statistics) are refreshed with the list.
      invalidateAdminResources(`${key}:`);
      return '';
    } catch (error) {
      const text = errorText(error, 'Действие не выполнено');
      if (toastError) onMessage({ type: 'err', text });
      return text;
    } finally {
      setBusy('');
    }
  }, [key, onMessage, reload]);

  return {
    key,
    items: resource.data ?? NO_ITEMS,
    loading: resource.loading,
    loadError: resource.error ? errorText(resource.error, 'Не удалось загрузить список') : '',
    busy,
    reload,
    run,
  };
}
