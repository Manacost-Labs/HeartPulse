import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminMessage } from '../adminWorkspaceState';
import {
  createParserRun,
  loadParserAudit,
  loadParserControl,
  loadParserControlBundle,
  loadParserRuns,
  updateParserPolicy,
  updateParserSections,
} from './client';
import { DataHealthOverviewCard } from './DataHealthOverviewCard';
import { EarlyMetaDialog } from './EarlyMetaDialog';
import { parserControlWarningMessage, toParserControlError, type ParserControlError } from './error';
import { ParserControlAlerts, ParserControlInitialError, ParserControlLoading } from './ParserControlStatus';
import { ParserRunsCard } from './ParserRunsCard';
import { ParserSectionsCard } from './ParserSectionsCard';
import { PublicationPolicyCard } from './PublicationPolicyCard';
import type { ParserAuditEntry, ParserControlSnapshot, ParserRun } from './types';

const ParserScheduleCard = React.lazy(async () => {
  const module = await import('./ParserScheduleCard');
  return { default: module.ParserScheduleCard };
});

const ParserAuditCard = React.lazy(async () => {
  const module = await import('./ParserAuditCard');
  return { default: module.ParserAuditCard };
});

const ACTIVE_RUN_STATUSES = new Set<ParserRun['status']>(['queued', 'running']);

type ParserRunsPollingOptions = {
  signal: AbortSignal;
  fetchRuns: (signal: AbortSignal) => Promise<ParserRun[]>;
  onRuns: (runs: ParserRun[]) => void;
  onError: (error: unknown) => void;
  onSettled: () => Promise<void>;
  intervalMs?: number;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
};

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener('abort', finish, { once: true });
    if (signal.aborted) finish();
  });
}

function hasActiveRuns(runs: ParserRun[]): boolean {
  return runs.some(run => ACTIVE_RUN_STATUSES.has(run.status));
}

export async function pollActiveParserRuns({
  signal,
  fetchRuns,
  onRuns,
  onError,
  onSettled,
  intervalMs = 8_000,
  wait = abortableDelay,
}: ParserRunsPollingOptions): Promise<void> {
  while (!signal.aborted) {
    await wait(intervalMs, signal);
    if (signal.aborted) return;
    try {
      const nextRuns = await fetchRuns(signal);
      if (signal.aborted) return;
      onRuns(nextRuns);
      if (!hasActiveRuns(nextRuns)) {
        await onSettled();
        return;
      }
    } catch (caught) {
      if (signal.aborted) return;
      onError(caught);
    }
  }
}

export function ParserControlPanel({ onMessage }: { onMessage: (message: AdminMessage | null) => void }) {
  const [snapshot, setSnapshot] = useState<ParserControlSnapshot | null>(null);
  const [runs, setRuns] = useState<ParserRun[]>([]);
  const [audit, setAudit] = useState<ParserAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [monitoringRefreshing, setMonitoringRefreshing] = useState(false);
  const [auditLoading, setAuditLoading] = useState(true);
  const [error, setError] = useState<ParserControlError | null>(null);
  const [runsError, setRunsError] = useState<ParserControlError | null>(null);
  const [auditError, setAuditError] = useState<ParserControlError | null>(null);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [savingSections, setSavingSections] = useState(false);
  const [startingRun, setStartingRun] = useState(false);
  const [earlyDialogOpen, setEarlyDialogOpen] = useState(false);
  const settledRefreshController = useRef<AbortController | null>(null);
  const auditRefreshController = useRef<AbortController | null>(null);
  const monitoringRefreshController = useRef<AbortController | null>(null);
  const hasActiveRun = hasActiveRuns(runs);

  const load = useCallback(async (signal?: AbortSignal, quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    setAuditLoading(true);
    try {
      const { control: controlResult, runs: runsResult, audit: auditResult } = await loadParserControlBundle(signal);
      if (signal?.aborted) return;
      if (controlResult.status === 'fulfilled') {
        setSnapshot(controlResult.value);
        setError(null);
      } else {
        setError(toParserControlError(controlResult.reason));
      }
      if (runsResult.status === 'fulfilled') {
        setRuns(runsResult.value);
        setRunsError(null);
      } else {
        setRunsError(toParserControlError(runsResult.reason));
      }
      if (auditResult.status === 'fulfilled') {
        setAudit(auditResult.value);
        setAuditError(null);
      } else {
        setAuditError(toParserControlError(auditResult.reason));
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setRefreshing(false);
        setAuditLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => () => {
    settledRefreshController.current?.abort();
    settledRefreshController.current = null;
    auditRefreshController.current?.abort();
    auditRefreshController.current = null;
    monitoringRefreshController.current?.abort();
    monitoringRefreshController.current = null;
  }, []);

  const refreshMonitoring = useCallback(async () => {
    const controller = new AbortController();
    monitoringRefreshController.current?.abort();
    monitoringRefreshController.current = controller;
    setMonitoringRefreshing(true);
    try {
      const nextSnapshot = await loadParserControl(controller.signal);
      if (!controller.signal.aborted) {
        setSnapshot(nextSnapshot);
        setError(null);
      }
    } catch (caught) {
      if (!controller.signal.aborted) setError(toParserControlError(caught));
    } finally {
      if (monitoringRefreshController.current === controller) {
        monitoringRefreshController.current = null;
        setMonitoringRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshMonitoring();
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [refreshMonitoring]);

  const refreshAudit = useCallback(async () => {
    const controller = new AbortController();
    auditRefreshController.current?.abort();
    auditRefreshController.current = controller;
    setAuditLoading(true);
    try {
      const entries = await loadParserAudit(controller.signal);
      if (controller.signal.aborted) return;
      setAudit(entries);
      setAuditError(null);
    } catch (caught) {
      if (!controller.signal.aborted) setAuditError(toParserControlError(caught));
    } finally {
      if (auditRefreshController.current === controller) {
        auditRefreshController.current = null;
        setAuditLoading(false);
      }
    }
  }, []);

  const refreshAfterSettledRun = useCallback(async () => {
    const controller = new AbortController();
    settledRefreshController.current?.abort();
    settledRefreshController.current = controller;
    try {
      await load(controller.signal, true);
    } finally {
      if (settledRefreshController.current === controller) {
        settledRefreshController.current = null;
      }
    }
  }, [load]);

  useEffect(() => {
    if (!hasActiveRun) return;
    const controller = new AbortController();
    void pollActiveParserRuns({
      signal: controller.signal,
      fetchRuns: loadParserRuns,
      onRuns: nextRuns => {
        setRuns(nextRuns);
        setRunsError(null);
      },
      onError: caught => setRunsError(toParserControlError(caught)),
      onSettled: refreshAfterSettledRun,
    });
    return () => controller.abort();
  }, [hasActiveRun, refreshAfterSettledRun]);

  const savePolicy = async (mode: 'stable' | 'early', earlyUntil: string | null, reason: string) => {
    if (!snapshot) return;
    setSavingPolicy(true);
    try {
      const next = await updateParserPolicy({ mode, earlyUntil, reason, expectedRevision: snapshot.revision });
      setSnapshot(next);
      setEarlyDialogOpen(false);
      const warning = parserControlWarningMessage(next.warnings);
      onMessage(warning
        ? { type: 'err', text: warning }
        : { type: 'ok', text: mode === 'early' ? 'Ранняя мета включена.' : 'Стабильная мета включена.' });
      void refreshAudit();
    } catch (caught) {
      onMessage({ type: 'err', text: toParserControlError(caught).message || 'Не удалось изменить режим публикации' });
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
      const warning = parserControlWarningMessage(next.warnings);
      onMessage(warning
        ? { type: 'err', text: warning }
        : { type: 'ok', text: 'Настройки автообновления сохранены.' });
      void refreshAudit();
    } catch (caught) {
      onMessage({ type: 'err', text: toParserControlError(caught).message || 'Не удалось сохранить разделы' });
      if ((caught as { status?: number })?.status === 409) void load(undefined, true);
    } finally {
      setSavingSections(false);
    }
  };

  const startRun = async (sectionIds: string[], reason: string) => {
    setStartingRun(true);
    try {
      const result = await createParserRun({ sectionIds, reason });
      const run = result.run;
      if (run) setRuns(current => [run, ...current.filter(item => item.id !== run.id)]);
      const warning = parserControlWarningMessage(result.warnings);
      if (warning) {
        onMessage({ type: 'err', text: warning });
      } else if (result.deduplicated) {
        const duplicateCount = run?.deduplicatedSourceIds.length ?? 0;
        const requestedCount = run?.requestedSourceIds.length ?? 0;
        onMessage({
          type: 'ok',
          text: duplicateCount > 0 && duplicateCount < requestedCount
            ? `Остальные источники добавлены в очередь; ${duplicateCount} уже обновляются.`
            : 'Повторный запуск не создан: выбранные источники уже обновляются.',
        });
      } else {
        onMessage({ type: 'ok', text: 'Выбранные разделы добавлены в очередь обновления.' });
      }
      void refreshAudit();
    } catch (caught) {
      onMessage({ type: 'err', text: toParserControlError(caught).message || 'Не удалось запустить обновление' });
    } finally {
      setStartingRun(false);
    }
  };

  if (loading && !snapshot) {
    return <ParserControlLoading />;
  }

  if (error && !snapshot) {
    return <ParserControlInitialError error={error} onRetry={() => void load()} />;
  }

  if (!snapshot) return null;

  return (
    <div className="admin-parser-control">
      <ParserControlAlerts
        error={error}
        warnings={snapshot.warnings}
        refreshing={refreshing}
        onRetry={() => void load(undefined, true)}
      />
      <DataHealthOverviewCard
        snapshot={snapshot}
        refreshing={refreshing || monitoringRefreshing}
        onRefresh={() => void refreshMonitoring()}
      />
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
      {snapshot.schedules.length > 0 && (
        <React.Suspense fallback={<p className="admin-parser-empty" role="status">Загружаем состояние расписания…</p>}>
          <ParserScheduleCard snapshot={snapshot} />
        </React.Suspense>
      )}
      <ParserRunsCard
        sections={snapshot.sections}
        runs={runs}
        starting={startingRun}
        refreshing={refreshing}
        loadError={runsError?.message ?? null}
        onStart={(sectionIds, reason) => void startRun(sectionIds, reason)}
        onRefresh={() => void load(undefined, true)}
      />
      <React.Suspense fallback={(
        <section className="contest-admin-card admin-parser-card" aria-label="Журнал изменений">
          <p className="admin-parser-empty" role="status" aria-live="polite">Готовим журнал изменений…</p>
        </section>
      )}>
        <ParserAuditCard
          entries={audit}
          loading={auditLoading}
          error={auditError?.message ?? null}
          onRefresh={() => void refreshAudit()}
        />
      </React.Suspense>
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
