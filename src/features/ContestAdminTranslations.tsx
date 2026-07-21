import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
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
type TranslationCoverage = {
  items: Array<{ nameEn: string; ranks: string[]; deckCode?: string }>;
  totalObserved: number;
  translated: number;
  missing: number;
  coveragePercent: number;
};
type MessageHandler = (message: AdminMessage | null) => void;
type LatestRequestLease = {
  signal: AbortSignal;
  isCurrent: () => boolean;
  release: () => void;
};
type LatestRequestCoordinator = {
  begin: () => LatestRequestLease;
  cancel: () => void;
};
const EMPTY_DRAFT: TranslationDraft = { nameEn: '', nameRu: '' };
const EMPTY_RESPONSE: TranslationResponse = {
  items: [], total: 0, page: 1, pageSize: 40, pages: 1,
  stats: { total: 0, manual: 0, blizzcore: 0, lastSyncedAt: null },
};
const EMPTY_COVERAGE: TranslationCoverage = {
  items: [], totalObserved: 0, translated: 0, missing: 0, coveragePercent: 100,
};

export function createLatestRequestCoordinator(): LatestRequestCoordinator {
  let requestId = 0;
  let activeController: AbortController | null = null;

  return {
    begin() {
      activeController?.abort();
      const controller = new AbortController();
      const currentRequestId = ++requestId;
      activeController = controller;
      return {
        signal: controller.signal,
        isCurrent: () => currentRequestId === requestId && !controller.signal.aborted,
        release: () => {
          if (currentRequestId === requestId) activeController = null;
        },
      };
    },
    cancel() {
      requestId += 1;
      activeController?.abort();
      activeController = null;
    },
  };
}

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

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const fallback = document.createElement('textarea');
    fallback.value = value;
    fallback.setAttribute('readonly', '');
    fallback.style.position = 'fixed';
    fallback.style.opacity = '0';
    document.body.appendChild(fallback);
    fallback.select();
    const copied = document.execCommand('copy');
    fallback.remove();
    return copied;
  }
}

type TranslationWorkspaceViewProps = {
  data: TranslationResponse;
  loading: boolean;
  saving: boolean;
  syncing: boolean;
  coverage: TranslationCoverage;
  coverageLoading: boolean;
  coverageError: string;
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
  onRetryCoverage: () => void;
  onTranslateMissing: (nameEn: string) => void;
  onCopyDeckCode: (nameEn: string, deckCode: string) => void;
  copiedDeckName: string;
  onPageChange: (page: number) => void;
  englishInputRef: React.RefObject<HTMLInputElement | null>;
  russianInputRef: React.RefObject<HTMLInputElement | null>;
};

function TranslationWorkspaceView({
  data,
  loading,
  saving,
  syncing,
  coverage,
  coverageLoading,
  coverageError,
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
  onRetryCoverage,
  onTranslateMissing,
  onCopyDeckCode,
  copiedDeckName,
  onPageChange,
  englishInputRef,
  russianInputRef,
}: TranslationWorkspaceViewProps) {
  return (
    <div className="admin-translation-workspace">
      <div className="admin-stat-grid admin-translation-stats" aria-label="Сводка переводов">
        <div className={coverage.missing ? 'needs-attention' : 'is-complete'}>
          <span>Покрытие Standard</span>
          <strong>{coverageLoading ? '…' : `${coverage.coveragePercent}%`}</strong>
          <small>{coverage.translated} из {coverage.totalObserved} актуальных</small>
        </div>
        <div className={coverage.missing ? 'needs-attention' : 'is-complete'}>
          <span>Нужно перевести</span>
          <strong>{coverageLoading ? '…' : coverage.missing}</strong>
          <small>{coverage.missing ? 'видны пользователям на английском' : 'всё переведено'}</small>
        </div>
        <div><span>Таблица переводов</span><strong>{data.stats.total}</strong><small>{data.stats.blizzcore} BlizzCore · {data.stats.manual} ручных</small></div>
        <div><span>Последняя синхронизация</span><strong className="admin-translation-date">{formatSyncDate(data.stats.lastSyncedAt)}</strong><small>источник: api.blizzcore.ru</small></div>
      </div>

      <form className="contest-admin-card admin-translation-form admin-translation-editor" onSubmit={onSubmit}>
        <div className="admin-card-heading">
          <div>
            <h2>{editing ? 'Редактирование перевода' : 'Добавить перевод'}</h2>
            <p className="contest-muted">Рабочая форма остаётся на месте, пока очередь и таблица обновляются ниже.</p>
          </div>
          {editing && <span className="admin-source-badge is-manual">Ручной</span>}
        </div>
        <div className="admin-translation-editor-fields">
          <label htmlFor="admin-translation-name-en">
            Английское название
            <input
              ref={englishInputRef}
              id="admin-translation-name-en"
              value={draft.nameEn}
              onChange={event => onDraftChange({ nameEn: event.target.value })}
              placeholder="Control Warrior"
              autoComplete="off"
              maxLength={180}
              required
            />
          </label>
          <label htmlFor="admin-translation-name-ru">
            Русский перевод
            <input
              ref={russianInputRef}
              id="admin-translation-name-ru"
              value={draft.nameRu}
              onChange={event => onDraftChange({ nameRu: event.target.value })}
              placeholder="Контроль Воин"
              autoComplete="off"
              maxLength={180}
              required
            />
          </label>
        </div>
        <div className="admin-translation-editor-footer">
          <div className="admin-form-actions">
            <button type="submit" className="contest-primary-button" disabled={saving}>
              {saving ? 'Сохраняем…' : editing ? 'Сохранить перевод' : 'Добавить перевод'}
            </button>
            {(editing || draft.nameEn || draft.nameRu) && (
              <button type="button" className="contest-secondary-button" onClick={onCancelEdit}>
                {editing ? 'Отмена' : 'Очистить'}
              </button>
            )}
          </div>
          <p className="admin-translation-form-note">После сохранения поля очистятся, а очередь обновится без скачка страницы.</p>
        </div>
      </form>

      <section className="contest-admin-card admin-translation-coverage" aria-labelledby="translation-coverage-title">
        <div className="admin-card-heading">
          <div>
            <h2 id="translation-coverage-title">Что ещё не переведено</h2>
            <p className="contest-muted">Сравниваем таблицу со всеми архетипами из матчапов и Meta HSGuru: Стандарт и Вольный, все доступные рейтинги.</p>
          </div>
          <button type="button" className="contest-secondary-button" onClick={onRetryCoverage} disabled={coverageLoading}>
            {coverageLoading ? 'Проверяем…' : 'Проверить ещё раз'}
          </button>
        </div>
        {!coverageError && !coverageLoading && (
          <div className="admin-translation-progress">
            <progress
              aria-label="Покрытие переводами актуальных архетипов"
              max={100}
              value={coverage.coveragePercent}
            />
            <strong>{coverage.translated} из {coverage.totalObserved}</strong>
          </div>
        )}
        {coverageError && (
          <div className="admin-translation-coverage-error" role="alert">
            <span>{coverageError}</span>
            <button type="button" onClick={onRetryCoverage}>Повторить</button>
          </div>
        )}
        {!coverageError && coverageLoading && <p className="contest-muted admin-translation-empty" role="status">Проверяем актуальные матчапы и срезы меты…</p>}
        {!coverageError && !coverageLoading && coverage.items.length > 0 && (
          <ul className="admin-untranslated-list" aria-label="Архетипы без перевода">
            {coverage.items.map(item => (
              <li key={item.nameEn}>
                <div>
                  <strong>{item.nameEn}</strong>
                  <span>{item.ranks.join(' · ')}</span>
                </div>
                <div className="admin-untranslated-actions">
                  {item.deckCode && (
                    <button
                      type="button"
                      className="contest-secondary-button admin-copy-deck-code"
                      onClick={() => onCopyDeckCode(item.nameEn, item.deckCode!)}
                      aria-label={`Скопировать код колоды ${item.nameEn}`}
                    >
                      {copiedDeckName === item.nameEn ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                      <span aria-live="polite">{copiedDeckName === item.nameEn ? 'Скопировано' : 'Код колоды'}</span>
                    </button>
                  )}
                  <button type="button" className="contest-primary-button" onClick={() => onTranslateMissing(item.nameEn)}>
                    Перевести
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {!coverageError && !coverageLoading && coverage.items.length === 0 && (
          <div className="admin-translation-covered" role="status">
            <strong>Все актуальные архетипы переведены</strong>
            <span>Новые названия появятся здесь автоматически после обновления матчапов или меты.</span>
          </div>
        )}
      </section>

      <div className="contest-admin-grid admin-translation-layout">
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
            <label htmlFor="admin-translation-search">
              Поиск
              <div className="admin-translation-search-control">
                <input
                  id="admin-translation-search"
                  type="search"
                  value={query}
                  onChange={event => onQueryChange(event.target.value)}
                  placeholder="Английское или русское название"
                />
                {query && <button type="button" onClick={() => onQueryChange('')} aria-label="Очистить поиск">Очистить</button>}
              </div>
            </label>
            <fieldset className="admin-translation-source-filter">
              <legend>Источник</legend>
              <div role="group" aria-label="Фильтр по источнику">
                <button type="button" aria-pressed={source === ''} onClick={() => onSourceChange('')}>Все</button>
                <button type="button" aria-pressed={source === 'manual'} onClick={() => onSourceChange('manual')}>Ручные</button>
                <button type="button" aria-pressed={source === 'blizzcore'} onClick={() => onSourceChange('blizzcore')}>BlizzCore</button>
              </div>
            </fieldset>
          </div>

          <div className="admin-translation-table-wrap" aria-busy={loading}>
            <table className="admin-translation-table">
              <caption className="sr-only">Управляемые переводы архетипов</caption>
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
  const [coverage, setCoverage] = useState<TranslationCoverage>(EMPTY_COVERAGE);
  const [coverageLoading, setCoverageLoading] = useState(true);
  const [coverageError, setCoverageError] = useState('');
  const [editing, setEditing] = useState<ArchetypeTranslation | null>(null);
  const [draft, setDraft] = useState<TranslationDraft>(EMPTY_DRAFT);
  const [copiedDeckName, setCopiedDeckName] = useState('');
  const copiedDeckTimerRef = useRef<number | null>(null);
  const englishInputRef = useRef<HTMLInputElement>(null);
  const russianInputRef = useRef<HTMLInputElement>(null);
  const loadCoordinatorRef = useRef<LatestRequestCoordinator | null>(null);
  if (!loadCoordinatorRef.current) loadCoordinatorRef.current = createLatestRequestCoordinator();

  const load = useCallback(async () => {
    const request = loadCoordinatorRef.current!.begin();
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: '40' });
    if (query.trim()) params.set('q', query.trim());
    if (source) params.set('source', source);
    try {
      const response = await fetch(`/api/admin/archetype-translations?${params}`, {
        headers: requestHeaders(), cache: 'no-store', credentials: 'same-origin', signal: request.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить переводы');
      if (!request.isCurrent()) return;
      setData(payload as TranslationResponse);
    } catch (error) {
      if (!request.isCurrent()) return;
      onMessage({ type: 'err', text: error instanceof Error ? error.message : 'Не удалось загрузить переводы' });
      setData(EMPTY_RESPONSE);
    } finally {
      if (request.isCurrent()) setLoading(false);
      request.release();
    }
  }, [onMessage, page, query, source]);

  const loadCoverage = useCallback(async (signal?: AbortSignal) => {
    setCoverageLoading(true);
    setCoverageError('');
    try {
      const response = await fetch('/api/admin/archetype-translations/untranslated', {
        headers: requestHeaders(), cache: 'no-store', credentials: 'same-origin', signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось проверить актуальные архетипы');
      setCoverage(payload as TranslationCoverage);
    } catch (error) {
      if (signal?.aborted) return;
      setCoverageError(error instanceof Error ? error.message : 'Не удалось проверить актуальные архетипы');
    } finally {
      if (!signal?.aborted) setCoverageLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), query.trim() ? 220 : 0);
    return () => {
      window.clearTimeout(timer);
      loadCoordinatorRef.current?.cancel();
    };
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    void loadCoverage(controller.signal);
    return () => controller.abort();
  }, [loadCoverage]);

  useEffect(() => () => {
    if (copiedDeckTimerRef.current !== null) window.clearTimeout(copiedDeckTimerRef.current);
  }, []);

  const resetEditor = () => {
    setEditing(null);
    setDraft(EMPTY_DRAFT);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const successMessage = editing ? 'Перевод обновлён.' : 'Перевод добавлен.';
      const response = await fetch(editing
        ? `/api/admin/archetype-translations/${editing.id}`
        : '/api/admin/archetype-translations', {
        method: editing ? 'PATCH' : 'POST',
        headers: requestHeaders(), credentials: 'same-origin',
        body: JSON.stringify({ translation: draft }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить перевод');
      resetEditor();
      if (page !== 1) {
        setPage(1);
        await loadCoverage();
      } else {
        await Promise.all([load(), loadCoverage()]);
      }
      await new Promise<void>(resolve => {
        window.requestAnimationFrame(() => {
          const activeElement = document.activeElement;
          const focusRemainsInEditor = activeElement instanceof Element
            && Boolean(activeElement.closest('.admin-translation-form'));
          const focusMayBeRestored = !activeElement
            || activeElement === document.body
            || focusRemainsInEditor;
          if (focusMayBeRestored) englishInputRef.current?.focus({ preventScroll: true });
          resolve();
        });
      });
      onMessage({ type: 'ok', text: successMessage });
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
      await Promise.all([load(), loadCoverage()]);
    } catch (error) {
      onMessage({ type: 'err', text: error instanceof Error ? error.message : 'Не удалось синхронизировать переводы' });
    } finally {
      setSyncing(false);
    }
  };

  const copyDeckCode = async (nameEn: string, deckCode: string) => {
    if (!await copyText(deckCode)) {
      onMessage({ type: 'err', text: 'Не удалось скопировать код колоды.' });
      return;
    }
    setCopiedDeckName(nameEn);
    if (copiedDeckTimerRef.current !== null) window.clearTimeout(copiedDeckTimerRef.current);
    copiedDeckTimerRef.current = window.setTimeout(() => {
      setCopiedDeckName(current => current === nameEn ? '' : current);
      copiedDeckTimerRef.current = null;
    }, 1800);
  };

  return (
    <TranslationWorkspaceView
      data={data} loading={loading} saving={saving} syncing={syncing}
      coverage={coverage} coverageLoading={coverageLoading} coverageError={coverageError}
      query={query} source={source} draft={draft} editing={editing}
      onQueryChange={value => { setQuery(value); setPage(1); }}
      onSourceChange={value => { setSource(value); setPage(1); }}
      onDraftChange={patch => setDraft(current => ({ ...current, ...patch }))}
      onSubmit={submit}
      onEdit={item => {
        setEditing(item);
        setDraft({ nameEn: item.nameEn, nameRu: item.nameRu });
        window.requestAnimationFrame(() => russianInputRef.current?.focus());
      }}
      onCancelEdit={resetEditor}
      onSync={() => void sync()}
      onRetryCoverage={() => void loadCoverage()}
      onCopyDeckCode={(nameEn, deckCode) => void copyDeckCode(nameEn, deckCode)}
      copiedDeckName={copiedDeckName}
      onTranslateMissing={nameEn => {
        setEditing(null);
        setDraft({ nameEn, nameRu: '' });
        window.requestAnimationFrame(() => russianInputRef.current?.focus());
      }}
      onPageChange={setPage}
      englishInputRef={englishInputRef}
      russianInputRef={russianInputRef}
    />
  );
}
