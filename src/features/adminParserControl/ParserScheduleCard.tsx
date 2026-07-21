import React from 'react';
import { CalendarClock, LockKeyhole } from 'lucide-react';
import { formatAdminDate } from './format';
import type { ParserControlSnapshot, ParserSchedule } from './types';

const RUNTIME_REASON_LABEL: Record<string, string> = {
  'host-snapshot-missing': 'снимок состояния ещё не создан',
  'host-snapshot-unreadable': 'снимок состояния нельзя прочитать',
  'host-snapshot-invalid': 'снимок состояния повреждён',
  'host-snapshot-schema': 'версия снимка не поддерживается',
  'host-snapshot-stale': 'снимок состояния устарел',
  'host-snapshot-future': 'время снимка некорректно',
  'partial-response': 'systemd вернул неполный ответ',
  'not-systemd': 'systemd недоступен в процессе API',
  'not-installed': 'systemctl не установлен',
  timeout: 'systemd не ответил вовремя',
  unavailable: 'systemd временно недоступен',
};

function runtimeReason(reason: string): string {
  return RUNTIME_REASON_LABEL[reason] || reason || 'причина не указана';
}

function scheduleState(schedule: ParserSchedule): { label: string; tone: string } {
  if (!schedule.runtimeStateAvailable) {
    return {
      label: schedule.nominalActive ? 'По плану' : 'Период завершён',
      tone: 'is-unknown',
    };
  }
  if (schedule.failure) return { label: 'Ошибка запуска', tone: 'is-error' };
  if (schedule.enabled === false) return { label: 'Отключён', tone: 'is-disabled' };
  if (schedule.active === false) return { label: 'Не активен', tone: 'is-warning' };
  if (schedule.enabled === true && schedule.active === true) return { label: 'Активен', tone: 'is-enabled' };
  return { label: 'Частичные данные', tone: 'is-warning' };
}

export function ParserScheduleCard({ snapshot }: { snapshot: ParserControlSnapshot }) {
  const nominalOnly = snapshot.scheduleTimeSemantics === 'nominal' && !snapshot.scheduleRuntimeStateIncluded;
  const runtime = snapshot.scheduleRuntimeState;
  return (
    <section className="contest-admin-card admin-parser-card" aria-labelledby="parser-schedules-title">
      <div className="admin-card-heading admin-parser-card__heading">
        <div>
          <h2 id="parser-schedules-title"><CalendarClock size={21} /> Расписание и состояние</h2>
          <p className="contest-muted">
            {snapshot.scheduleRuntimeStateIncluded
              ? `Фактическое состояние systemd проверено ${formatAdminDate(runtime.checkedAt)}.`
              : `Показан только версионный план: ${runtimeReason(runtime.reason)}.`}
          </p>
        </div>
        <span className="admin-parser-readonly"><LockKeyhole size={15} aria-hidden="true" /> Только чтение</span>
      </div>

      <div className="admin-parser-schedule-list" role="list">
        {snapshot.schedules.map(schedule => {
          const state = scheduleState(schedule);
          return (
            <article key={schedule.id} className={`admin-parser-schedule ${schedule.failure ? 'has-runtime-error' : ''}`} role="listitem">
            <div className="admin-parser-schedule__head">
              <div>
                <strong>{schedule.label}</strong>
                <code>{schedule.id}</code>
              </div>
              <span className={`admin-parser-schedule__state ${state.tone}`}>{state.label}</span>
            </div>
            {schedule.description && <p>{schedule.description}</p>}
            <dl>
              {schedule.trigger && <div><dt>Правило запуска</dt><dd>{schedule.trigger}</dd></div>}
              <div>
                <dt>Следующий запуск</dt>
                <dd>{formatAdminDate(schedule.nextRunAt)}{schedule.nextRunAtSource === 'runtime' ? ' · systemd' : ' · по плану'}</dd>
              </div>
              {schedule.runtimeStateAvailable && <div><dt>Последний запуск</dt><dd>{formatAdminDate(schedule.lastRunAt)}</dd></div>}
              <div><dt>Часовой пояс</dt><dd>{schedule.timezone || 'UTC'}</dd></div>
              {schedule.temporaryUntil && <div><dt>Действует до</dt><dd>{formatAdminDate(schedule.temporaryUntil)}</dd></div>}
              {schedule.systemdUnit && <div><dt>Таймер</dt><dd><code>{schedule.systemdUnit}</code></dd></div>}
              {schedule.serviceUnit && <div><dt>Задача</dt><dd><code>{schedule.serviceUnit}</code></dd></div>}
              {schedule.failure && (
                <div className="admin-parser-schedule__failure">
                  <dt>Причина сбоя</dt>
                  <dd><code>{schedule.failure}</code></dd>
                </div>
              )}
            </dl>
            {schedule.calendarEntries.length > 1 && (
              <details className="admin-parser-schedule__rules">
                <summary>Правила systemd: {schedule.calendarEntries.length}</summary>
                <ul>
                  {schedule.calendarEntries.map(entry => <li key={entry}><code>{entry}</code></li>)}
                </ul>
              </details>
            )}
            <div className="admin-parser-schedule__scope">
              {schedule.sectionIds.length > 0 && <span>Разделов: {schedule.sectionIds.length}</span>}
              {schedule.sourceIds.length > 0 && <span>Источников: {schedule.sourceIds.length}</span>}
            </div>
            </article>
          );
        })}
      </div>
      {snapshot.schedulesGeneratedAt && (
        <p className="admin-parser-schedule-updated">
          Снимок расписания: {formatAdminDate(snapshot.schedulesGeneratedAt)}
          {snapshot.scheduleInventoryVersion && ` · версия ${snapshot.scheduleInventoryVersion}`}
          {snapshot.scheduleRuntimeStateIncluded && runtime.provider && ` · ${runtime.provider}`}
          {!nominalOnly && runtime.status === 'partial' && ` · неполный runtime: ${runtimeReason(runtime.reason)}`}
        </p>
      )}
    </section>
  );
}
