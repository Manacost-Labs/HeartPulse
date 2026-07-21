import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, RefreshCw, ServerOff } from 'lucide-react';
import type { AdminMessage } from '../adminWorkspaceState';
import {
  createParserRun,
  loadParserControl,
  loadParserRuns,
  updateParserPolicy,
  updateParserSections,
} from './client';
import { EarlyMetaDialog } from './EarlyMetaDialog';
import { ParserRunsCard } from './ParserRunsCard';
import { ParserSectionsCard } from './ParserSectionsCard';
import { PublicationPolicyCard } from './PublicationPolicyCard';
import type { ParserControlSnapshot, ParserRun } from './types';

type PanelError = { message: string; unavailable: boolean } | null;

function errorState(error: unknown): PanelError {
  const value = error as Error & { code?: string; status?: number };
  return {
    message: value?.message || 'Не удалось загрузить управление парсерами',
    unavailable: value?.code === 'HS_DATA_API_NOT_CONFIGURED' || value?.status === 503,
  };
}

function warningMessage(snapshot: ParserControlSnapshot): string | null {
  return snapshot.warnings.map(warning => warning.message).find(Boolean) ?? null;
}

export function ParserControlPanel({ onMessage }: { onMessage: (message: AdminMessage | null) => void }) {
  const [snapshot, setSnapshot] = useState<ParserControlSnapshot | null>(null);
  const [runs, setRuns] = useState<ParserRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<PanelError>(null);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [savingSections, setSavingSections] = useState(false);
  const [startingRun, setStartingRun] = useState(false);
  const [earlyDialogOpen, setEarlyDialogOpen] = useState(false);

  const load = useCallback(async (signal?: AbortSignal, quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    try {
      const [control, recentRuns] = await Promise.all([
        loadParserControl(signal),
        loadParserRuns(signal).catch(() => []),
      ]);
      setSnapshot(control);
      setRuns(recentRuns);
      setError(null);
    } catch (caught) {
      if (!signal?.aborted) setError(errorState(caught));
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (!runs.some(run => run.status === 'queued' || run.status === 'running')) return;
    const timer = window.setInterval(() => {
      void loadParserRuns().then(nextRuns => {
        setRuns(nextRuns);
        if (!nextRuns.some(run => run.status === 'queued' || run.status === 'running')) {
          void load(undefined, true);
        }
      }).catch(() => undefined);
    }, 8_000);
    return () => window.clearInterval(timer);
  }, [load, runs]);

  const savePolicy = async (mode: 'stable' | 'early', earlyUntil: string | null, reason: string) => {
    if (!snapshot) return;
    setSavingPolicy(true);
    try {
      const next = await updateParserPolicy({ mode, earlyUntil, reason, expectedRevision: snapshot.revision });
      setSnapshot(next);
      setEarlyDialogOpen(false);
      const warning = warningMessage(next);
      onMessage(warning
        ? { type: 'err', text: warning }
        : { type: 'ok', text: mode === 'early' ? 'Ранняя мета включена.' : 'Стабильная мета включена.' });
    } catch (caught) {
      onMessage({ type: 'err', text: errorState(caught)?.message || 'Не удалось изменить режим публикации' });
      if ((caught as { status?: number })?.status === 409) void load(undefined, true);
    } finally {
      setSavingPolicy(false);
    }
  };

  const saveSections = async (sections: Record<string, boolean>) => {
    if (!snapshot) return;
    setSavingSections(true);
    try {
      const next = await updateParserSections({ sections, expectedRevision: snapshot.revision });
      setSnapshot(next);
      onMessage({ type: 'ok', text: 'Настройки автообновления сохранены.' });
    } catch (caught) {
      onMessage({ type: 'err', text: errorState(caught)?.message || 'Не удалось сохранить разделы' });
      if ((caught as { status?: number })?.status === 409) void load(undefined, true);
    } finally {
      setSavingSections(false);
    }
  };

  const startRun = async (sectionIds: string[], reason: string) => {
    setStartingRun(true);
    try {
      const run = await createParserRun({ sectionIds, reason });
      if (run) setRuns(current => [run, ...current.filter(item => item.id !== run.id)]);
      onMessage({ type: 'ok', text: 'Выбранные разделы добавлены в очередь обновления.' });
    } catch (caught) {
      onMessage({ type: 'err', text: errorState(caught)?.message || 'Не удалось запустить обновление' });
    } finally {
      setStartingRun(false);
    }
  };

  if (loading && !snapshot) {
    return (
      <section className="contest-admin-card admin-parser-loading" aria-busy="true" aria-live="polite">
        <RefreshCw size={22} className="is-spinning" />
        <div><strong>Загружаем управление данными</strong><span>Проверяем режим, источники и последние запуски.</span></div>
      </section>
    );
  }

  if (error && !snapshot) {
    const Icon = error.unavailable ? ServerOff : AlertCircle;
    return (
      <section className={`contest-admin-card admin-parser-error ${error.unavailable ? 'is-unavailable' : ''}`} role={error.unavailable ? 'status' : 'alert'}>
        <Icon size={26} aria-hidden="true" />
        <div>
          <strong>{error.unavailable ? 'Управление парсерами не подключено' : 'Не удалось загрузить панель'}</strong>
          <span>{error.message}</span>
          {error.unavailable && <small>Добавьте серверный ключ HS_DATA_API_ADMIN_KEY. Он не передаётся в браузер.</small>}
        </div>
        <button type="button" className="contest-secondary-button" onClick={() => void load()}>Повторить</button>
      </section>
    );
  }

  if (!snapshot) return null;

  return (
    <div className="admin-parser-control">
      {error && (
        <div className="admin-parser-inline-error" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>{error.message}</span>
          <button type="button" disabled={refreshing} onClick={() => void load(undefined, true)}>Повторить</button>
        </div>
      )}
      {snapshot.warnings.length > 0 && (
        <div className="admin-parser-inline-warning" role="status">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <strong>Настройки сохранены с предупреждением</strong>
            {snapshot.warnings.map(warning => <span key={`${warning.code}:${warning.message}`}>{warning.message}</span>)}
          </div>
          <button type="button" disabled={refreshing} onClick={() => void load(undefined, true)}>Обновить статусы</button>
        </div>
      )}
      <div className="admin-parser-overview" aria-label="Сводка управления данными">
        <div><span>Автообновление</span><strong>{snapshot.summary.enabledSections} / {snapshot.sections.length}</strong><small>разделов включено</small></div>
        <div><span>Ранняя мета</span><strong>{snapshot.summary.earlyCapableSources}</strong><small>источников поддерживают</small></div>
        <div className={snapshot.summary.activeRuns ? 'is-running' : ''}><span>Активные задачи</span><strong>{snapshot.summary.activeRuns || runs.filter(run => ['queued', 'running'].includes(run.status)).length}</strong><small>очередь и выполнение</small></div>
        <div className={snapshot.summary.failedSources ? 'needs-attention' : 'is-complete'}><span>Ошибки источников</span><strong>{snapshot.summary.failedSources}</strong><small>{snapshot.summary.failedSources ? 'требуют проверки' : 'всё в порядке'}</small></div>
      </div>

      <PublicationPolicyCard
        snapshot={snapshot}
        saving={savingPolicy}
        onSelectStable={() => {
          if (snapshot.policy.mode !== 'stable') void savePolicy('stable', null, 'Возврат к стабильной мете');
        }}
        onSelectEarly={() => setEarlyDialogOpen(true)}
      />
      <ParserSectionsCard snapshot={snapshot} saving={savingSections} onSave={sections => void saveSections(sections)} />
      <ParserRunsCard
        sections={snapshot.sections}
        runs={runs}
        starting={startingRun}
        refreshing={refreshing}
        onStart={(sectionIds, reason) => void startRun(sectionIds, reason)}
        onRefresh={() => void load(undefined, true)}
      />
      <EarlyMetaDialog
        open={earlyDialogOpen}
        initialUntil={snapshot.policy.earlyUntil}
        initialReason={snapshot.policy.reason}
        capableSources={snapshot.summary.earlyCapableSources}
        saving={savingPolicy}
        onClose={() => setEarlyDialogOpen(false)}
        onConfirm={(earlyUntil, reason) => void savePolicy('early', earlyUntil, reason)}
      />
    </div>
  );
}
