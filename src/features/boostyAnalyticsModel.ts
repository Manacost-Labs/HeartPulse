export type AnalyticsDateRange = {
  from: string;
  to: string;
};

export function defaultAnalyticsDateRange(now = new Date()): AnalyticsDateRange {
  const end = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  ));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 89);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

export function analyticsQueryRange(range: AnalyticsDateRange): {
  from: string;
  to: string;
} | null {
  const from = parseDay(range.from);
  const through = parseDay(range.to);
  if (!from || !through || through < from) return null;
  const to = new Date(through);
  to.setUTCDate(to.getUTCDate() + 1);
  if (to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) return null;
  return { from: from.toISOString(), to: to.toISOString() };
}

export function formatRub(value: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatAnalyticsDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function parseDay(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}
