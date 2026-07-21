import React from 'react';
import { CalendarClock, LockKeyhole } from 'lucide-react';
import { formatAdminDate } from './format';
import type { ParserControlSnapshot } from './types';

export function ParserScheduleCard({ snapshot }: { snapshot: ParserControlSnapshot }) {
  const nominalOnly = snapshot.scheduleTimeSemantics === 'nominal' && !snapshot.scheduleRuntimeStateIncluded;
  return (
    <section className="contest-admin-card admin-parser-card" aria-labelledby="parser-schedules-title">
      <div className="admin-card-heading admin-parser-card__heading">
        <div>
          <h2 id="parser-schedules-title"><CalendarClock size={21} /> Плановое расписание</h2>
          <p className="contest-muted">
            Версионный план запусков доступен только для просмотра.
            {nominalOnly && ' Фактическое состояние таймеров systemd здесь не проверяется.'}
          </p>
        </div>
        <span className="admin-parser-readonly"><LockKeyhole size={15} aria-hidden="true" /> Только чтение</span>
      </div>

      <div className="admin-parser-schedule-list" role="list">
        {snapshot.schedules.map(schedule => (
          <article key={schedule.id} className="admin-parser-schedule" role="listitem">
            <div className="admin-parser-schedule__head">
              <div>
                <strong>{schedule.label}</strong>
                <code>{schedule.id}</code>
              </div>
              {schedule.enabled != null && (
                <span className={`admin-parser-schedule__state ${schedule.enabled ? 'is-enabled' : 'is-disabled'}`}>
                  {nominalOnly
                    ? schedule.enabled ? 'Запланировано' : 'Период завершён'
                    : schedule.enabled ? 'Активно' : 'Отключено'}
                </span>
              )}
            </div>
            {schedule.description && <p>{schedule.description}</p>}
            <dl>
              {schedule.trigger && <div><dt>Правило запуска</dt><dd>{schedule.trigger}</dd></div>}
              <div><dt>Следующий запуск</dt><dd>{formatAdminDate(schedule.nextRunAt)}</dd></div>
              <div><dt>Часовой пояс</dt><dd>{schedule.timezone || 'UTC'}</dd></div>
              {schedule.temporaryUntil && <div><dt>Действует до</dt><dd>{formatAdminDate(schedule.temporaryUntil)}</dd></div>}
              {schedule.systemdUnit && <div><dt>Таймер</dt><dd><code>{schedule.systemdUnit}</code></dd></div>}
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
        ))}
      </div>
      {snapshot.schedulesGeneratedAt && (
        <p className="admin-parser-schedule-updated">
          Снимок расписания: {formatAdminDate(snapshot.schedulesGeneratedAt)}
          {snapshot.scheduleInventoryVersion && ` · версия ${snapshot.scheduleInventoryVersion}`}
        </p>
      )}
    </section>
  );
}
