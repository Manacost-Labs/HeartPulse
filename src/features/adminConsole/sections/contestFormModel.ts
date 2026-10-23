/** Date fields, winner lists and status labels of the contest editor. */
import type { ContestDraft } from '../../ContestAdminContests';

export const EMPTY_CONTEST_DRAFT: ContestDraft = {
  id: '',
  title: '',
  prize: '',
  imageUrl: '',
  startsAt: '',
  endsAt: '',
  status: 'active',
  description: '',
};

/** The value of a `datetime-local` field for a stored time; a zone-less value is already local. */
export function formatDateTimeInput(value: string | null | undefined): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && !/(Z|[+-]\d{2}:?\d{2})$/i.test(value)) return String(value).slice(0, 16);
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return String(value).slice(0, 16);
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function parseDateTimeInput(value: string): Date | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    const [, year, month, day, hour, minute, second = '0'] = match;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function dateTimeInputToIso(value: string): string {
  if (!value) return '';
  const parsed = parseDateTimeInput(value);
  return parsed && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : value;
}

export function addHoursForDateInput(hours: number): string {
  return formatDateTimeInput(new Date(Date.now() + hours * 60 * 60 * 1000).toISOString());
}

/** Profile ids typed or pasted as winners: one per line, comma or semicolon, without repeats. */
export function parseWinnerIds(value: string): string[] {
  return Array.from(new Set(value.split(/[\n,;]/).map(item => item.trim()).filter(Boolean)));
}

export function contestStatusLabel(status: string): string {
  if (status === 'approved') return 'Одобрено';
  if (status === 'pending') return 'На проверке';
  if (status === 'completed') return 'Завершен';
  if (status === 'planned') return 'Скоро';
  if (status === 'draft') return 'Черновик';
  if (status === 'cancelled') return 'Отменен';
  return 'Активен';
}
