import React from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { AdminCrmSegmentId } from '../api/adminCrmClient';
import {
  activityText,
  relativeTime,
  sparklinePoints,
  trend,
  type AdminCrmOverview,
  type OverviewAlert,
} from './overviewModel';

const SEVERITY_ICON = { critical: AlertOctagon, warning: AlertTriangle, info: Info } as const;
const SEVERITY_LABEL = { critical: 'Срочно', warning: 'Внимание', info: 'К сведению' } as const;

type Navigate = { onNavigate: (section: string) => void; onOpenSegment: (segment: AdminCrmSegmentId) => void };

export function OverviewAlerts({ alerts, onNavigate, onOpenSegment }: { alerts: OverviewAlert[] } & Navigate) {
  if (!alerts.length) {
    return (
      <p className="admin-overview-calm" role="status">
        <CheckCircle2 size={18} aria-hidden="true" /> Всё спокойно: интеграции работают, срочных задач нет.
      </p>
    );
  }
  return (
    <ul className="admin-overview-alerts" aria-label="Требует внимания">
      {alerts.map(alert => {
        const Icon = SEVERITY_ICON[alert.severity];
        const action = alert.action;
        return (
          <li key={alert.id} className={`is-${alert.severity}`}>
            <Icon size={18} aria-hidden="true" />
            <div>
              <strong><span className="admin-crm-sr-only">{SEVERITY_LABEL[alert.severity]}: </span>{alert.title}</strong>
              <span>{alert.detail}</span>
            </div>
            {action && (
              <button type="button" className="contest-secondary-button" onClick={() => (
                action.segment ? onOpenSegment(action.segment as AdminCrmSegmentId) : onNavigate(action.section)
              )}>{action.label}</button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Sparkline({ values, label }: { values: number[]; label: string }) {
  const points = sparklinePoints(values, 120, 32);
  if (!points) return null;
  const last = points.split(' ').at(-1)?.split(',') ?? ['0', '0'];
  return (
    <svg className="admin-overview-spark" viewBox="0 0 120 32" preserveAspectRatio="none" role="img" aria-label={label}>
      <polygon points={`0,32 ${points} 120,32`} />
      <polyline points={points} />
      <circle cx={last[0]} cy={last[1]} r="2.5" />
    </svg>
  );
}

type KpisProps = { overview: AdminCrmOverview } & Pick<Navigate, 'onOpenSegment'>;

export function OverviewKpis({ overview, onOpenSegment }: KpisProps) {
  const { kpis, series } = overview;
  const growth = trend(kpis.newUsers30d, kpis.newUsersPrevious30d);
  return (
    <ul className="admin-overview-kpis" aria-label="Главные показатели за 30 дней">
      <li><button type="button" onClick={() => onOpenSegment('paying')}>
        <span>С доступом сейчас</span>
        <strong>{kpis.payingNow.toLocaleString('ru-RU')}</strong>
        <small>платят {kpis.payingProvider.toLocaleString('ru-RU')} · вручную {kpis.manualAccess.toLocaleString('ru-RU')}</small>
        <Sparkline values={series.paying} label="Платящие подписчики по дням" />
      </button></li>
      <li><button type="button" onClick={() => onOpenSegment('new')}>
        <span>Новые пользователи</span>
        <strong>{kpis.newUsers30d.toLocaleString('ru-RU')}</strong>
        <small>
          {growth
            ? <><b className={`is-${growth.direction}`}>{growth.percent > 0 ? '+' : ''}{growth.percent}%</b> к прошлым 30 дням</>
            : 'за 30 дней'}
        </small>
        <Sparkline values={series.newUsers} label="Регистрации по дням" />
      </button></li>
      <li><button type="button" onClick={() => onOpenSegment('lapsed')}>
        <span>Потеряли доступ</span>
        <strong>{kpis.lapsed30d.toLocaleString('ru-RU')}</strong>
        <small>за 30 дней, можно вернуть</small>
      </button></li>
      <li><button type="button" onClick={() => onOpenSegment('expiring')}>
        <span>Истекает за 7 дней</span>
        <strong>{kpis.expiringSoon.toLocaleString('ru-RU')}</strong>
        <small>ручной доступ, стоит продлить</small>
      </button></li>
    </ul>
  );
}

export function OverviewActivityFeed({ overview, onOpenPerson }: { overview: AdminCrmOverview; onOpenPerson: (userId: string) => void }) {
  return (
    <section className="admin-overview-panel" aria-labelledby="admin-overview-activity">
      <h3 id="admin-overview-activity">Последние события</h3>
      {overview.activity.length ? (
        <ol className="admin-overview-feed">
          {overview.activity.map(item => {
            const text = activityText(item);
            const userId = 'userId' in item ? item.userId : undefined;
            return (
              <li key={item.id} className={`is-${item.kind}`}>
                <div>
                  {userId
                    ? <button type="button" className="admin-crm-open" onClick={() => onOpenPerson(userId)}>{text.title}</button>
                    : <strong>{text.title}</strong>}
                  <span>{text.detail}</span>
                </div>
                <time dateTime={item.at}>{relativeTime(item.at)}</time>
              </li>
            );
          })}
        </ol>
      ) : <p className="admin-crm-muted">Событий пока нет.</p>}
    </section>
  );
}

const QUICK_ACTIONS: ReadonlyArray<{ section: string; label: string }> = [
  { section: 'users', label: 'Найти человека и выдать доступ' },
  { section: 'articles', label: 'Написать статью' },
  { section: 'mailing', label: 'Сделать рассылку' },
  { section: 'contests', label: 'Запустить конкурс' },
  { section: 'referrals', label: 'Создать рекламную ссылку' },
  { section: 'standard-data', label: 'Проверить данные и парсеры' },
];

export function OverviewQuickActions({ onNavigate }: Pick<Navigate, 'onNavigate'>) {
  return (
    <section className="admin-overview-panel" aria-labelledby="admin-overview-actions">
      <h3 id="admin-overview-actions">Быстрые действия</h3>
      <div className="admin-overview-actions">
        {QUICK_ACTIONS.map(action => (
          <button key={action.section} type="button" onClick={() => onNavigate(action.section)}>{action.label}</button>
        ))}
      </div>
    </section>
  );
}
