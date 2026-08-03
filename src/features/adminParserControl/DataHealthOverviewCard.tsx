import React, { useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  DatabaseBackup,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { formatAdminDate } from './format';
import { buildParserMonitoringSnapshot, formatMonitoringAge } from './monitoring';
import type { ParserControlSnapshot } from './types';

const STATE_COPY = {
  healthy: {
    title: 'Все источники работают штатно',
    description: 'Свежие снимки доступны пользователям, критических ошибок нет.',
  },
  degraded: {
    title: 'Система работает с ограничениями',
    description: 'Часть источников использует резервные данные или требует проверки.',
  },
  critical: {
    title: 'Требуется вмешательство',
    description: 'Есть источники без доступного опубликованного снимка или с критической ошибкой.',
  },
  unknown: {
    title: 'Нет активных источников',
    description: 'Мониторинг пока не получил данные об активных источниках.',
  },
} as const;

export function DataHealthOverviewCard({
  snapshot,
  refreshing,
  onRefresh,
  now = Date.now(),
}: {
  snapshot: ParserControlSnapshot;
  refreshing: boolean;
  onRefresh: () => void;
  now?: number;
}) {
  const monitoring = useMemo(
    () => buildParserMonitoringSnapshot(snapshot, now),
    [snapshot, now],
  );
  const copy = STATE_COPY[monitoring.state];
  const activityNote = [
    monitoring.runningSources ? `Обновляются: ${monitoring.runningSources}` : '',
    monitoring.pausedSources ? `Приостановлены: ${monitoring.pausedSources}` : '',
  ].filter(Boolean).join(' · ') || 'Без активных обновлений';

  return (
    <section
      className="contest-admin-card admin-parser-card admin-data-health"
      aria-labelledby="admin-data-health-title"
      aria-busy={refreshing}
    >
      <div className="admin-card-heading admin-parser-card__heading">
        <div>
          <h2 id="admin-data-health-title"><Activity size={21} aria-hidden="true" /> Мониторинг данных</h2>
          <p className="contest-muted">
            Последний снимок: {formatAdminDate(monitoring.generatedAt)}. Автообновление каждые 60 секунд.
          </p>
        </div>
        <button type="button" className="contest-secondary-button" disabled={refreshing} onClick={onRefresh}>
          <RefreshCw size={16} className={refreshing ? 'is-spinning' : ''} aria-hidden="true" />
          {refreshing ? 'Обновляем…' : 'Обновить сейчас'}
        </button>
      </div>

      <div className={`admin-data-health__summary is-${monitoring.state}`} role="status" aria-live="polite">
        {monitoring.state === 'healthy'
          ? <CheckCircle2 size={22} aria-hidden="true" />
          : monitoring.state === 'critical'
            ? <ShieldAlert size={22} aria-hidden="true" />
            : <AlertTriangle size={22} aria-hidden="true" />}
        <div><strong>{copy.title}</strong><span>{copy.description}</span></div>
      </div>

      <dl className="admin-data-health__metrics" aria-label="Сводка состояния источников">
        <div>
          <dt>Работают штатно</dt>
          <dd>{monitoring.healthySources} из {monitoring.totalSources}</dd>
          <span>{activityNote}</span>
        </div>
        <div className={monitoring.degradedSources ? 'needs-attention' : ''}>
          <dt>С ограничениями</dt>
          <dd>{monitoring.degradedSources}</dd>
          <span>частичные или устаревшие данные</span>
        </div>
        <div className={monitoring.failedSources ? 'is-critical' : ''}>
          <dt>Критические ошибки</dt>
          <dd>{monitoring.failedSources}</dd>
          <span>{monitoring.failedSources ? 'нужно проверить' : 'не обнаружены'}</span>
        </div>
        <div className={monitoring.fallbackSources ? 'uses-fallback' : ''}>
          <dt>Резервные версии</dt>
          <dd>{monitoring.fallbackSources}</dd>
          <span>последний успех: {formatMonitoringAge(
            monitoring.lastSuccessfulAt ? Math.max(0, now - Date.parse(monitoring.lastSuccessfulAt)) : null,
          )}</span>
        </div>
      </dl>

      {monitoring.attentionSources.length > 0 ? (
        <div className="admin-data-health__attention">
          <div className="admin-data-health__attention-heading">
            <h3>Требуют внимания</h3>
            <span>{monitoring.attentionSources.length}</span>
          </div>
          <ul>
            {monitoring.attentionSources.map(source => (
              <li key={`${source.sectionLabel}:${source.id}`} className={`is-${source.state}`}>
                <div className="admin-data-health__source-heading">
                  <div><strong>{source.label}</strong><small>{source.sectionLabel} · <code>{source.id}</code></small></div>
                  <span>{source.state === 'failed' ? 'Ошибка' : 'Ограничение'}</span>
                </div>
                <div className="admin-data-health__source-meta">
                  <span>Успешно: {formatMonitoringAge(source.ageMs)}</span>
                  {source.itemCount != null && <span>Записей: {source.itemCount.toLocaleString('ru-RU')}</span>}
                  {source.fallback && <span className="uses-fallback"><DatabaseBackup size={14} aria-hidden="true" /> Резервная версия</span>}
                  {source.sourceState && <span>API: <code>{source.sourceState}</code></span>}
                </div>
                {source.lastError && <p>{source.lastError}</p>}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="admin-data-health__empty"><CheckCircle2 size={18} aria-hidden="true" /> Все активные источники доступны.</p>
      )}
    </section>
  );
}
