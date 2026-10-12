import { auditActionLabel, formatDate, upperFirst } from './adminClientCardModel';
import type { OverviewActivity } from '../api/adminCrmContracts';
import type { ChartPoint } from '../../../shared/ui/analytics/analyticsModel';

export type { AdminCrmOverview, OverviewActivity, OverviewAlert } from '../api/adminCrmContracts';


const CONTEST_STATUS: Record<string, string> = { pending: 'ждёт проверки', approved: 'одобрена', rejected: 'отклонена', winner: 'победитель' };

/** One line of the activity feed: a headline and a secondary line. */
export function activityText(item: OverviewActivity): { title: string; detail: string } {
  if (item.kind === 'registration') return { title: 'Новый пользователь', detail: item.name || 'без имени' };
  if (item.kind === 'contest') {
    return { title: `Заявка на конкурс «${item.contestTitle || 'без названия'}»`, detail: `${item.name || 'участник'} · ${CONTEST_STATUS[item.status] ?? item.status}` };
  }
  if (item.kind === 'mailing') {
    const count = (value: number) => value.toLocaleString('ru-RU');
    return { title: `Рассылка «${item.subject}»`, detail: `доставлено ${count(item.accepted)}${item.failed ? `, ошибок ${count(item.failed)}` : ''}` };
  }
  return {
    title: upperFirst(auditActionLabel(item.action, item.details)),
    detail: item.targetName ? `${item.actorName} → ${item.targetName}` : item.actorName,
  };
}

/** Change against the previous period, or null when there is nothing to compare with. */
export function trend(current: number, previous: number): { direction: 'up' | 'down' | 'flat'; percent: number } | null {
  if (!previous) return null;
  const percent = Math.round(((current - previous) / previous) * 100);
  return { direction: percent > 0 ? 'up' : percent < 0 ? 'down' : 'flat', percent };
}

/** Preserve UTC day coordinates and missing observations instead of inventing zero counts. */
export function overviewChartPoints(days: string[], values: number[]): ChartPoint[] {
  return days.flatMap((day, index) => {
    const timestamp = Date.parse(day);
    return Number.isFinite(timestamp) ? [{
      x: timestamp, y: Number.isFinite(values[index]) ? values[index] : null,
      label: new Date(timestamp).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
    }] : [];
  }).sort((a, b) => a.x - b.x);
}

export function relativeTime(at: string, now = Date.now()): string {
  const time = new Date(at).getTime();
  if (!Number.isFinite(time)) return '';
  const minutes = Math.round((now - time) / 60_000);
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  return formatDate(at, true);
}
