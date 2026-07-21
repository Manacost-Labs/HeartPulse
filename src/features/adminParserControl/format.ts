import type { ParserHealth, ParserRunStatus } from './types';

export function formatAdminDate(value: string | null): string {
  if (!value) return 'Нет данных';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Нет данных';
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function toDateTimeLocal(value: string | null): string {
  const candidate = value ? new Date(value) : null;
  const date = candidate && Number.isFinite(candidate.getTime()) && candidate.getTime() > Date.now()
    ? candidate
    : new Date(Date.now() + 48 * 60 * 60_000);
  if (!Number.isFinite(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export const HEALTH_LABEL: Record<ParserHealth, string> = {
  healthy: 'Работает',
  warning: 'Требует внимания',
  error: 'Ошибка',
  running: 'Обновляется',
  paused: 'Приостановлен',
  unknown: 'Нет статуса',
};

export const RUN_LABEL: Record<ParserRunStatus, string> = {
  queued: 'В очереди',
  running: 'Выполняется',
  succeeded: 'Завершено',
  partial: 'Частично',
  failed: 'Ошибка',
  cancelled: 'Отменено',
};
