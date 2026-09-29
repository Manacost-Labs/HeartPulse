import { auditActionLabel, formatDate, upperFirst } from './adminClientCardModel';
import type { OverviewActivity } from '../api/adminCrmContracts';

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

/** SVG polyline points for a sparkline scaled to its own min/max inside width × height. */
export function sparklinePoints(values: number[], width: number, height: number, padding = 3): string {
  if (values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  return values
    .map((value, index) => `${(index * step).toFixed(1)},${(height - padding - ((value - min) / span) * (height - padding * 2)).toFixed(1)}`)
    .join(' ');
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
