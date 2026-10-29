import React from 'react';
import { AlertOctagon, AlertTriangle, ArrowUpRight, CheckCircle2, Database, Info, Link2, Mail, Newspaper, Trophy, Users } from 'lucide-react';
import type { AdminCrmSegmentId } from '../api/adminCrmClient';
import { LineChart } from '../../../shared/ui/analytics/LineChart';
import {
  activityText,
  relativeTime,
  overviewChartPoints,
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
              <button type="button" className="contest-secondary-button" aria-label={`${action.label}: ${alert.title}`} onClick={() => (
                action.segment ? onOpenSegment(action.segment as AdminCrmSegmentId) : onNavigate(action.section)
              )}>{action.label}</button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

type KpisProps = { overview: AdminCrmOverview } & Pick<Navigate, 'onOpenSegment'>;

export function OverviewKpis({ overview, onOpenSegment }: KpisProps) {
  const { kpis } = overview;
  const growth = trend(kpis.newUsers30d, kpis.newUsersPrevious30d);
  return (
    <ul className="admin-overview-kpis" aria-label="Показатели аудитории">
      <li>
        <span>С доступом сейчас</span>
        <strong>{kpis.payingNow.toLocaleString('ru-RU')}</strong>
        <small>платят {kpis.payingProvider.toLocaleString('ru-RU')} · вручную {kpis.manualAccess.toLocaleString('ru-RU')}</small>
        <div className="admin-overview-kpi-links">
          <button type="button" onClick={() => onOpenSegment('paying')}>Платящие <ArrowUpRight size={14} aria-hidden="true" /></button>
          <button type="button" onClick={() => onOpenSegment('manual')}>Ручной доступ <ArrowUpRight size={14} aria-hidden="true" /></button>
        </div>
      </li>
      <li>
        <span>Новые за 30 дней</span>
        <strong>{kpis.newUsers30d.toLocaleString('ru-RU')}</strong>
        <small>
          {growth
            ? <><b className={`is-${growth.direction}`}>{growth.percent > 0 ? '+' : ''}{growth.percent}%</b> к прошлым 30 дням</>
            : 'за 30 дней'}
        </small>
      <button type="button" onClick={() => onOpenSegment('new')}>Новые за 7 дней <ArrowUpRight size={14} aria-hidden="true" /></button>
      </li>
      <li>
        <span>Потеряли доступ</span>
        <strong>{kpis.lapsed30d.toLocaleString('ru-RU')}</strong>
        <small>за 30 дней, можно вернуть</small>
      <button type="button" onClick={() => onOpenSegment('lapsed')}>Потерявшие доступ <ArrowUpRight size={14} aria-hidden="true" /></button>
      </li>
      <li>
        <span>Истекает за 7 дней</span>
        <strong>{kpis.expiringSoon.toLocaleString('ru-RU')}</strong>
        <small>ручной доступ, стоит продлить</small>
      <button type="button" onClick={() => onOpenSegment('expiring')}>Истекающие доступы <ArrowUpRight size={14} aria-hidden="true" /></button>
      </li>
    </ul>
  );
}

export function OverviewCharts({ overview: { series } }: { overview: AdminCrmOverview }) {
  return (
    <div className="admin-overview-charts">
      <LineChart title="Платящие подписчики по дням" subtitle="Активный оплаченный доступ · 30 дней, UTC" points={overviewChartPoints(series.days, series.paying)} unit="count" domain={{ minimum: 0 }} />
      <LineChart title="Регистрации по дням" subtitle="Новые пользователи · 30 дней, UTC" points={overviewChartPoints(series.days, series.newUsers)} unit="count" domain={{ minimum: 0 }} color="#28704a" />
    </div>
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

const QUICK_ACTIONS = [
  { section: 'users', label: 'Пользователи', detail: 'Поиск, доступ и карточка клиента', icon: Users },
  { section: 'articles', label: 'Статьи', detail: 'Публикации и редактирование', icon: Newspaper },
  { section: 'mailing', label: 'Рассылки', detail: 'Письма, аудитории и отправки', icon: Mail },
  { section: 'contests', label: 'Конкурсы', detail: 'Заявки и победители', icon: Trophy },
  { section: 'referrals', label: 'Реферальные ссылки', detail: 'Кампании и привлечённые пользователи', icon: Link2 },
  { section: 'standard-data', label: 'Данные и парсеры', detail: 'Обновления, источники и очереди', icon: Database },
];

export function OverviewQuickActions({ onNavigate }: Pick<Navigate, 'onNavigate'>) {
  return (
    <section className="admin-overview-panel" aria-labelledby="admin-overview-actions">
      <h3 id="admin-overview-actions">Управление сайтом</h3>
      <div className="admin-overview-actions">
        {QUICK_ACTIONS.map(action => (
          <button key={action.section} type="button" onClick={() => onNavigate(action.section)}>
            <span className="admin-overview-action-icon"><action.icon size={18} aria-hidden="true" /></span>
            <span><strong>{action.label}</strong><small>{action.detail}</small></span>
            <ArrowUpRight size={16} aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}
