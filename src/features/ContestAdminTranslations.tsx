import React, { useCallback, useEffect, useState } from 'react';
import type { AdminMessage } from './adminWorkspaceState';

export type ArchetypeTranslation = {
  id: number;
  blizzcoreId: number | null;
  nameEn: string;
  nameRu: string;
  source: 'blizzcore' | 'manual';
  createdAt: string;
  updatedAt: string;
  syncedAt: string | null;
  updatedBy: string | null;
};

type TranslationResponse = {
  items: ArchetypeTranslation[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  stats: { total: number; manual: number; blizzcore: number; lastSyncedAt: string | null };
};

type TranslationDraft = { nameEn: string; nameRu: string };
type MessageHandler = (message: AdminMessage | null) => void;
const EMPTY_DRAFT: TranslationDraft = { nameEn: '', nameRu: '' };
const EMPTY_RESPONSE: TranslationResponse = {
  items: [], total: 0, page: 1, pageSize: 40, pages: 1,
  stats: { total: 0, manual: 0, blizzcore: 0, lastSyncedAt: null },
};

function requestHeaders(): HeadersInit {
  return { 'Content-Type': 'application/json', 'X-CSRF-Request': '1' };
}

function formatSyncDate(value: string | null): string {
  if (!value) return 'ещё не выполнялась';
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? parsed.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
    : value;
}

type TranslationWorkspaceViewProps = {
  data: TranslationResponse;
  loading: boolean;
  saving: boolean;
  syncing: boolean;
  query: string;
  source: string;
  draft: TranslationDraft;
  editing: ArchetypeTranslation | null;
  onQueryChange: (value: string) => void;
  onSourceChange: (value: string) => void;
  onDraftChange: (patch: Partial<TranslationDraft>) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onEdit: (item: ArchetypeTranslation) => void;
  onCancelEdit: () => void;
  onSync: () => void;
  onPageChange: (page: number) => void;
};

function TranslationWorkspaceView({
  data,
  loading,
  saving,
  syncing,
  query,
  source,
  draft,
  editing,
  onQueryChange,
  onSourceChange,
  onDraftChange,
  onSubmit,
  onEdit,
  onCancelEdit,
  onSync,
  onPageChange,
}: TranslationWorkspaceViewProps) {
  return (
    <div className="admin-translation-workspace">
      <div className="admin-stat-grid admin-translation-stats" aria-label="Сводка переводов">
        <div><span>Всего переводов</span><strong>{data.stats.total}</strong><small>доступно сайту</small></div>
        <div><span>Из BlizzCore</span><strong>{data.stats.blizzcore}</strong><small>обновляются синхронизацией</small></div>
        <div><span>Ручные</span><strong>{data.stats.manual}</strong><small>имеют приоритет</small></div>
        <div><span>Последняя синхронизация</span><strong className="admin-translation-date">{formatSyncDate(data.stats.lastSyncedAt)}</strong><small>источник: api.blizzcore.ru</small></div>
      </div>

      <div className="contest-admin-grid admin-translation-layout">
        <form className="contest-admin-card admin-translation-form" onSubmit={onSubmit}>
          <div className="admin-card-heading">
            <div>
              <h2>{editing ? 'Редактирование перевода' : 'Новый перевод'}</h2>
              <p className="contest-muted">Ручная запись не будет перезаписана следующей синхронизацией.</p>
            </div>
            {editing && <span className="admin-source-badge is-manual">Ручной</span>}
          </div>
          <label>
            Английское название
            <input
              value={draft.nameEn}
              onChange={event => onDraftChange({ nameEn: event.target.value })}
              placeholder="Control Warrior"
              autoComplete="off"
              maxLength={180}
              required
            />
          </label>
          <label>
            Русский перевод
            <input
              value={draft.nameRu}
              onChange={event => onDraftChange({ nameRu: event.target.value })}
              placeholder="Контроль Воин"
              autoComplete="off"
              maxLength={180}
              required
            />
          </label>
          <div className="admin-form-actions">
            <button type="submit" className="contest-primary-button" disabled={saving}>
              {saving ? 'Сохраняем…' : editing ? 'Сохранить перевод' : 'Добавить перевод'}
            </button>
            {editing && <button type="button" className="contest-secondary-button" onClick={onCancelEdit}>Отмена</button>}
          </div>
        </form>

        <section className="contest-admin-card admin-translation-list-card" aria-labelledby="translation-table-title">
          <div className="admin-card-heading">
            <div>
              <h2 id="translation-table-title">Таблица переводов</h2>
              <p className="contest-muted">Найдено: {data.total}. Изменения сразу применяются к названиям архетипов.</p>
            </div>
            <button type="button" className="contest-secondary-button" onClick={onSync} disabled={syncing}>
              {syncing ? 'Синхронизация…' : 'Обновить из BlizzCore'}
            </button>
          </div>
          <div className="admin-list-toolbar admin-translation-toolbar">
            <label>
              Поиск
              <input value={query} onChange={event => onQueryChange(event.target.value)} placeholder="Английское или русское название" />
            </label>
            <label>
              Источник
              <select value={source} onChange={event => onSourceChange(event.target.value)}>
                <option value="">Все переводы</option>
                <option value="manual">Ручные</option>
                <option value="blizzcore">BlizzCore</option>
              </select>
            </label>
          </div>

          <div className="admin-translation-table-wrap" aria-busy={loading}>
            <table className="admin-translation-table">
              <thead><tr><th>English</th><th>Русский</th><th>Источник</th><th aria-label="Действия" /></tr></thead>
              <tbody>
                {data.items.map(item => (
                  <tr key={item.id}>
                    <td><strong>{item.nameEn}</strong>{item.blizzcoreId && <small>BlizzCore #{item.blizzcoreId}</small>}</td>
                    <td>{item.nameRu}</td>
                    <td><span className={`admin-source-badge ${item.source === 'manual' ? 'is-manual' : ''}`}>{item.source === 'manual' ? 'Ручной' : 'BlizzCore'}</span></td>
                    <td><button type="button" className="contest-secondary-button" onClick={() => onEdit(item)}>Изменить</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && !data.items.length && <p className="contest-muted admin-translation-empty" role="status">По заданным условиям переводы не найдены.</p>}
            {loading && <p className="contest-muted admin-translation-empty" role="status">Загружаем переводы…</p>}
          </div>

          {data.pages > 1 && (
            <div className="admin-pagination">
              <button type="button" disabled={data.page <= 1 || loading} onClick={() => onPageChange(data.page - 1)}>Назад</button>
              <span>Страница {data.page} из {data.pages}</span>
              <button type="button" disabled={data.page >= data.pages || loading} onClick={() => onPageChange(data.page + 1)}>Дальше</button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export function ContestAdminTranslations({ onMessage }: { onMessage: MessageHandler }) {
  const [data, setData] = useState<TranslationResponse>(EMPTY_RESPONSE);
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [editing, setEditing] = useState<ArchetypeTranslation | null>(null);
  const [draft, setDraft] = useState<TranslationDraft>(EMPTY_DRAFT);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: '40' });
    if (query.trim()) params.set('q', query.trim());
    if (source) params.set('source', source);
    try {
      const response = await fetch(`/api/admin/archetype-translations?${params}`, {
        headers: requestHeaders(), cache: 'no-store', credentials: 'same-origin', signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить переводы');
      setData(payload as TranslationResponse);
    } catch (error) {
      if (signal?.aborted) return;
      onMessage({ type: 'err', text: error instanceof Error ? error.message : 'Не удалось загрузить переводы' });
      setData(EMPTY_RESPONSE);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [onMessage, page, query, source]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), query.trim() ? 220 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [load]);

  const resetEditor = () => {
    setEditing(null);
    setDraft(EMPTY_DRAFT);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch(editing
        ? `/api/admin/archetype-translations/${editing.id}`
        : '/api/admin/archetype-translations', {
        method: editing ? 'PATCH' : 'POST',
        headers: requestHeaders(), credentials: 'same-origin',
        body: JSON.stringify({ translation: draft }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить перевод');
      onMessage({ type: 'ok', text: editing ? 'Перевод обновлён.' : 'Перевод добавлен.' });
      resetEditor();
      if (page !== 1) setPage(1);
      else await load();
    } catch (error) {
      onMessage({ type: 'err', text: error instanceof Error ? error.message : 'Не удалось сохранить перевод' });
    } finally {
      setSaving(false);
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const response = await fetch('/api/admin/archetype-translations/sync', {
        method: 'POST', headers: requestHeaders(), credentials: 'same-origin', body: '{}',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось синхронизировать переводы');
      onMessage({ type: 'ok', text: `BlizzCore синхронизирован: ${payload.rows} строк, новых — ${payload.imported}.` });
      await load();
    } catch (error) {
      onMessage({ type: 'err', text: error instanceof Error ? error.message : 'Не удалось синхронизировать переводы' });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <TranslationWorkspaceView
      data={data} loading={loading} saving={saving} syncing={syncing}
      query={query} source={source} draft={draft} editing={editing}
      onQueryChange={value => { setQuery(value); setPage(1); }}
      onSourceChange={value => { setSource(value); setPage(1); }}
      onDraftChange={patch => setDraft(current => ({ ...current, ...patch }))}
      onSubmit={submit}
      onEdit={item => { setEditing(item); setDraft({ nameEn: item.nameEn, nameRu: item.nameRu }); }}
      onCancelEdit={resetEditor}
      onSync={() => void sync()}
      onPageChange={setPage}
    />
  );
}
