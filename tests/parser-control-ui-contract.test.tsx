import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createParserRun, loadParserControlBundle } from '../src/features/adminParserControl/client.js';
import {
  parserControlWarningMessage,
  toParserControlError,
} from '../src/features/adminParserControl/error.js';
import { normalizeParserControl, normalizeParserRuns } from '../src/features/adminParserControl/normalize.js';
import { pollActiveParserRuns } from '../src/features/adminParserControl/ParserControlPanel.js';
import { ParserControlInitialError } from '../src/features/adminParserControl/ParserControlStatus.js';
import { ParserRunsCard } from '../src/features/adminParserControl/ParserRunsCard.js';
import { ParserScheduleCard } from '../src/features/adminParserControl/ParserScheduleCard.js';

const snapshot = normalizeParserControl({
  revision: 2,
  policy: { mode: 'stable' },
  sections: [{
    id: 'arena',
    label: 'Арена',
    group: 'arena',
    sources: [{ id: 'hsreplay_arena', label: 'HSReplay Arena', status: 'healthy' }],
  }],
  scheduleInventory: {
    inventoryVersion: '2026-07-21.1',
    generatedAt: '2026-07-21T03:00:00Z',
    timeSemantics: 'nominal',
    runtimeTimerStateIncluded: false,
    schedules: [{
      id: 'arena-five-hour',
      label: 'Арена каждые пять часов',
      systemdUnit: 'hs-data-api-docker-refresh-post-patch-tierlists.timer',
      onCalendar: ['2026-07-21 00,05,10,15,20:20:00 Europe/Warsaw', '2026-07-22 01,06,11,16,21:20:00 Europe/Warsaw'],
      isActive: true,
      validUntil: '2026-07-27T19:20:00Z',
      nextRunAt: '2026-07-21T05:00:00Z',
      sectionIds: ['arena'],
      sourceIds: ['hsreplay_arena'],
    }],
  },
});

const runs = normalizeParserRuns({
  runs: [{
    id: 'run-1',
    status: 'partial',
    requestedSourceIds: ['hsreplay_arena', 'already-running'],
    sourceIds: ['hsreplay_arena'],
    deduplicatedSourceIds: ['already-running'],
    results: [{
      sourceId: 'hsreplay_arena',
      state: 'ok',
      servingCachedDataset: true,
      rowsTotal: 731,
      error: 'Свежий ответ не прошёл проверку качества',
      errors: ['origin timeout', 'publisher returned stale data'],
      errorsTotal: 75,
      errorsTruncated: true,
    }],
  }],
});

const runsMarkup = renderToStaticMarkup(
  <ParserRunsCard
    sections={snapshot.sections}
    runs={runs}
    starting={false}
    refreshing={false}
    loadError="Сервер данных временно недоступен"
    onStart={() => undefined}
    onRefresh={() => undefined}
  />,
);
assert.match(runsMarkup, /role="alert"/);
assert.match(runsMarkup, /Не удалось обновить историю запусков/);
assert.match(runsMarkup, /Повторить/);
assert.match(runsMarkup, /уже запущенных источников не добавлены повторно/);
assert.match(runsMarkup, /Результаты источников/);
assert.match(runsMarkup, /HSReplay Arena/);
assert.match(runsMarkup, /Показан сохранённый снимок/);
assert.match(runsMarkup, /Ошибки источника/);
assert.match(runsMarkup, /origin timeout/);
assert.match(runsMarkup, /publisher returned stale data/);
assert.match(runsMarkup, /Показаны первые 2 из 75 ошибок/);

const emptyRunsWithErrorMarkup = renderToStaticMarkup(
  <ParserRunsCard
    sections={snapshot.sections}
    runs={[]}
    starting={false}
    refreshing={false}
    loadError="Сервер данных временно недоступен"
    onStart={() => undefined}
    onRefresh={() => undefined}
  />,
);
assert.doesNotMatch(
  emptyRunsWithErrorMarkup,
  /Ручных запусков ещё не было/,
  'a load failure must not be presented as an empty history',
);

const scheduleMarkup = renderToStaticMarkup(<ParserScheduleCard snapshot={snapshot} />);
assert.match(scheduleMarkup, /Плановое расписание/);
assert.match(scheduleMarkup, /Только чтение/);
assert.match(scheduleMarkup, /Арена каждые пять часов/);
assert.match(scheduleMarkup, /Фактическое состояние таймеров systemd здесь не проверяется/);
assert.match(scheduleMarkup, /Запланировано/);
assert.match(scheduleMarkup, /Правила systemd: 2/);
assert.match(scheduleMarkup, /версия 2026-07-21.1/);
assert.match(scheduleMarkup, /role="list"/);

const initialError = toParserControlError(new TypeError('Failed to fetch'));
assert.match(initialError.message, /Нет связи с сервером данных/);
const initialErrorMarkup = renderToStaticMarkup(
  <ParserControlInitialError error={initialError} onRetry={() => undefined} />,
);
assert.match(initialErrorMarkup, /role="alert"/);
assert.match(initialErrorMarkup, /Повторить/);

const unavailableError = toParserControlError(Object.assign(new Error('Не подключено'), {
  status: 503,
  code: 'HS_DATA_API_NOT_CONFIGURED',
}));
assert.equal(unavailableError.unavailable, true);

const upstreamAuthError = toParserControlError(Object.assign(new Error('safe BFF message'), {
  status: 502,
  code: 'HS_DATA_API_AUTH_FAILED',
}));
assert.match(upstreamAuthError.message, /серверный ключ HS_DATA_API_ADMIN_KEY/i);

const revisionConflictError = toParserControlError(Object.assign(new Error('raw conflict'), {
  status: 409,
  code: 'REVISION_CONFLICT',
}));
assert.match(revisionConflictError.message, /настройки уже изменены/i);
assert.match(revisionConflictError.message, /повторите/i);

const combinedWarning = parserControlWarningMessage([
  { code: 'AUDIT_WRITE_FAILED', message: 'Журнал аудита недоступен' },
  { code: 'AUDIT_WRITE_FAILED', message: 'Другая формулировка', requestId: 'request-audit' },
  { code: 'RUN_MONITOR_FAILED', message: 'Автоматическое наблюдение не включилось', requestId: 'request-monitor' },
]);
assert.match(combinedWarning ?? '', /Журнал аудита недоступен/);
assert.match(combinedWarning ?? '', /Код запроса: request-audit/);
assert.match(combinedWarning ?? '', /Автоматическое наблюдение не включилось/);
assert.match(combinedWarning ?? '', /Код запроса: request-monitor/);
assert.equal((combinedWarning?.match(/Журнал аудита недоступен/g) ?? []).length, 1);

let pollCalls = 0;
let activePolls = 0;
let maximumConcurrentPolls = 0;
let settledRefreshes = 0;
const observedPollStatuses: string[] = [];
const pollingController = new AbortController();
let settledSignalWasAborted = false;
await pollActiveParserRuns({
  signal: pollingController.signal,
  wait: async () => undefined,
  fetchRuns: async () => {
    pollCalls += 1;
    activePolls += 1;
    maximumConcurrentPolls = Math.max(maximumConcurrentPolls, activePolls);
    await Promise.resolve();
    activePolls -= 1;
    return pollCalls === 1
      ? normalizeParserRuns({ runs: [{ id: 'active', status: 'running' }] })
      : normalizeParserRuns({ runs: [{ id: 'active', status: 'succeeded' }] });
  },
  onRuns: nextRuns => {
    observedPollStatuses.push(nextRuns[0]?.status ?? 'missing');
    if (nextRuns[0]?.status === 'succeeded') pollingController.abort();
  },
  onError: error => { throw error; },
  onSettled: async () => {
    settledSignalWasAborted = pollingController.signal.aborted;
    await Promise.resolve();
    settledRefreshes += 1;
  },
});
assert.equal(pollCalls, 2);
assert.equal(maximumConcurrentPolls, 1, 'the next poll must wait until the current request finishes');
assert.equal(settledRefreshes, 1);
assert.equal(
  settledSignalWasAborted,
  true,
  'the terminal refresh must not reuse the polling signal that React aborts after the active state changes',
);
assert.deepEqual(
  observedPollStatuses,
  ['running', 'succeeded'],
  'the terminal response must reach local state even when the follow-up refresh later fails',
);

let releaseAbortedPoll!: (value: ReturnType<typeof normalizeParserRuns>) => void;
let updatesAfterAbort = 0;
const abortController = new AbortController();
const abortedPolling = pollActiveParserRuns({
  signal: abortController.signal,
  wait: async () => undefined,
  fetchRuns: async () => new Promise(resolve => { releaseAbortedPoll = resolve; }),
  onRuns: () => { updatesAfterAbort += 1; },
  onError: () => { updatesAfterAbort += 1; },
  onSettled: async () => { updatesAfterAbort += 1; },
});
await Promise.resolve();
abortController.abort();
releaseAbortedPoll(normalizeParserRuns({ runs: [{ id: 'late', status: 'running' }] }));
await abortedPolling;
assert.equal(updatesAfterAbort, 0, 'an in-flight response must not update state after unmount');

const originalFetch = globalThis.fetch;
globalThis.fetch = async input => {
  const path = String(input);
  if (path.endsWith('/runs')) {
    return new Response(JSON.stringify({ error: 'История временно недоступна' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ revision: 1, policy: { mode: 'stable' }, sections: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
const partialLoad = await loadParserControlBundle();
assert.equal(partialLoad.control.status, 'fulfilled');
assert.equal(partialLoad.runs.status, 'rejected', 'run-history errors must remain observable by the panel');
if (partialLoad.runs.status === 'rejected') {
  assert.match(String((partialLoad.runs.reason as Error)?.message), /История временно недоступна/);
}

globalThis.fetch = async () => new Response(JSON.stringify({
  run: {
    id: 'run-deduplicated',
    status: 'running',
    sourceIds: ['hsreplay_arena'],
    requestedSourceIds: ['hsreplay_arena'],
    deduplicatedSourceIds: ['hsreplay_arena'],
  },
  deduplicated: true,
  warnings: [{ code: 'AUDIT_WRITE_FAILED', message: 'Журнал временно недоступен' }],
}), { status: 202, headers: { 'Content-Type': 'application/json' } });
try {
  const creation = await createParserRun({ sectionIds: ['arena'], reason: 'Проверка' });
  assert.equal(creation.deduplicated, true);
  assert.equal(creation.run?.deduplicated, true);
  assert.deepEqual(creation.run?.deduplicatedSourceIds, ['hsreplay_arena']);
  assert.equal(creation.warnings[0]?.code, 'AUDIT_WRITE_FAILED');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('parser control UI contract tests passed');
