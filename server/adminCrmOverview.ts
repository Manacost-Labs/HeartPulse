/** Admin CRM overview (docs/specs/admin-crm.md): alerts, KPIs with 30-day series and recent activity. */
import { ADMIN_USER_SEGMENTS, adminUserSegmentWhere, ACTIVE_MANUAL_GRANT_SQL } from './adminCrmSegments.js';
import type { AdminCrmRepository } from './adminCrmReadModel.js';
import { readActivity } from './adminCrmActivity.js';

export type OverviewAlert = {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  action?: { section: string; segment?: string; label: string };
};

const DAY_MS = 86_400_000;
const HEALTH_WINDOW_MS = 2 * 60 * 60 * 1000;
const HEALTH_MIN_CHECKS = 3;
const ACTIVITY_LIMIT = 15;
// Errors that mean the bot cannot see a chat, as opposed to transient API failures.
const CHAT_LEVEL_ERROR = /chat not found|kicked|forbidden|not enough rights|have no rights|admin_required|member list is inaccessible/i;
const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 } as const;

const str = (value: unknown) => (value === null || value === undefined ? '' : String(value));
const num = (value: unknown) => Number(value ?? 0) || 0;
const parse = (value: unknown): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(str(value) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
};

/** Russian plural: plural(3, ['письмо', 'письма', 'писем']) === 'письма'. */
export function plural(count: number, forms: [string, string, string]): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

function integrationAlerts(repository: AdminCrmRepository, now: Date): OverviewAlert[] {
  const since = new Date(now.getTime() - HEALTH_WINDOW_MS).toISOString();
  const recent = (source: string) => repository.all(
    'SELECT detail_json FROM subscription_checks WHERE source = ? AND checked_at >= ? ORDER BY checked_at DESC LIMIT 1000',
    source, since,
  ).map(row => parse(row.detail_json));
  const alerts: OverviewAlert[] = [];

  // A VIP chat the bot cannot read silently denies access to members of that chat only. Timeouts,
  // rate limits and network errors are Telegram API trouble and are reported once, not per chat.
  const chats = new Map<string, { checks: number; failures: number; error: string }>();
  const api = { checks: 0, failures: 0, error: '' };
  for (const detail of recent('telegram')) {
    for (const chat of Array.isArray(detail.chats) ? detail.chats as Array<Record<string, unknown>> : []) {
      const error = str(chat.error);
      api.checks += 1;
      const entry = chats.get(str(chat.chatId)) ?? { checks: 0, failures: 0, error: '' };
      entry.checks += 1;
      if (chat.ok === false && CHAT_LEVEL_ERROR.test(error)) { entry.failures += 1; entry.error ||= error; }
      else if (chat.ok === false) { api.failures += 1; api.error ||= error; }
      chats.set(str(chat.chatId), entry);
    }
  }
  for (const [chatId, entry] of chats) {
    if (entry.checks < HEALTH_MIN_CHECKS || entry.failures * 2 < entry.checks) continue;
    alerts.push({
      id: `telegram-chat:${chatId}`,
      severity: 'critical',
      title: `Бот не видит VIP-группу Telegram ${chatId}`,
      detail: `${entry.failures} из ${entry.checks} проверок за 2 часа: ${entry.error}. Участники только этой группы не получают доступ.`,
      action: { section: 'telegram', label: 'Открыть Telegram' },
    });
  }
  if (api.failures >= HEALTH_MIN_CHECKS && api.failures * 2 >= api.checks) {
    alerts.push({
      id: 'telegram-api',
      severity: 'warning',
      title: 'Telegram API отвечает с ошибками',
      detail: `${api.failures} из ${api.checks} проверок групп за 2 часа не получили ответа: ${api.error || 'ошибка сети'}. Доступ из Telegram может временно не подтверждаться.`,
      action: { section: 'telegram', label: 'Открыть Telegram' },
    });
  }

  const boosty = recent('boosty');
  const stale = boosty.filter(detail => detail.stale === true || detail.providerUnavailable === true).length;
  if (boosty.length >= HEALTH_MIN_CHECKS && stale * 2 >= boosty.length) {
    alerts.push({
      id: 'boosty-stale',
      severity: 'critical',
      title: 'Данные Boosty устарели',
      detail: `${stale} из ${boosty.length} проверок за 2 часа не смогли подтвердить подписку. После 24 часов подписчики Boosty потеряют доступ: обновите сессию boosty-auth.`,
      action: { section: 'boosty', label: 'Открыть Boosty' },
    });
  }
  return alerts;
}

function segmentCounts(repository: AdminCrmRepository): Record<string, number> {
  const columns = ADMIN_USER_SEGMENTS
    .map(segment => `SUM(CASE WHEN ${adminUserSegmentWhere(segment.id)} THEN 1 ELSE 0 END) AS "${segment.id}"`)
    .join(', ');
  const row = repository.get(`
    SELECT ${columns}, SUM(CASE WHEN COALESCE(s.has_access, 0) = 1 OR ${ACTIVE_MANUAL_GRANT_SQL} THEN 1 ELSE 0 END) AS paying_now
    FROM users u
    LEFT JOIN subscriptions s ON s.user_id = u.id
    LEFT JOIN manual_subscription_grants g ON g.user_id = u.id
  `) ?? {};
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, num(value)]));
}

function workAlerts(repository: AdminCrmRepository, counts: Record<string, number>, now: Date): OverviewAlert[] {
  const alerts: OverviewAlert[] = [];
  if (counts.expiring) {
    alerts.push({
      id: 'expiring-access', severity: 'warning',
      title: `${counts.expiring} ${plural(counts.expiring, ['ручной доступ истекает', 'ручных доступа истекают', 'ручных доступов истекают'])} в ближайшие 7 дней`,
      detail: 'Продлите доступ тем, кому он ещё нужен, пока он не закрылся.',
      action: { section: 'users', segment: 'expiring', label: 'Показать' },
    });
  }
  const pending = num(repository.get("SELECT COUNT(*) AS count FROM contest_entries WHERE status = 'pending'")?.count);
  if (pending) {
    alerts.push({
      id: 'pending-contest-entries', severity: 'warning',
      title: `${pending} ${plural(pending, ['заявка ждёт', 'заявки ждут', 'заявок ждут'])} проверки в конкурсах`,
      detail: 'Одобрите или отклоните заявки, чтобы участники увидели результат.',
      action: { section: 'contests', label: 'К конкурсам' },
    });
  }
  const since = new Date(now.getTime() - 7 * DAY_MS).toISOString();
  const failed = num(repository.get('SELECT SUM(failed_count) AS failed FROM mailing_campaigns WHERE created_at >= ?', since)?.failed);
  if (failed) {
    alerts.push({
      id: 'mailing-failures', severity: 'warning',
      title: 'Есть недоставленные письма',
      detail: `За 7 дней не доставлено ${failed} ${plural(failed, ['письмо', 'письма', 'писем'])}. Проверьте адреса и историю рассылки.`,
      action: { section: 'mailing', label: 'К рассылке' },
    });
  }
  if (counts.lapsed) {
    alerts.push({
      id: 'lapsed-access', severity: 'info',
      title: `${counts.lapsed} ${plural(counts.lapsed, ['человек потерял', 'человека потеряли', 'человек потеряли'])} доступ за 30 дней`,
      detail: 'Им можно написать и предложить вернуться.',
      action: { section: 'users', segment: 'lapsed', label: 'Показать' },
    });
  }
  return alerts;
}

function dailySeries(repository: AdminCrmRepository, now: Date) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Array.from({ length: 30 }, (_, index) => new Date(today - (29 - index) * DAY_MS).toISOString().slice(0, 10));
  const since = `${days[0]}T00:00:00.000Z`;
  const fill = (rows: Record<string, unknown>[]) => {
    const byDay = new Map(rows.map(row => [str(row.day), num(row.count)]));
    return days.map(day => byDay.get(day) ?? 0);
  };
  return {
    days,
    newUsers: fill(repository.all('SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count FROM users WHERE created_at >= ? GROUP BY day', since)),
    // Provider access only: manual grants are not written to subscription_checks.
    paying: fill(repository.all(`
      SELECT substr(checked_at, 1, 10) AS day, COUNT(DISTINCT user_id) AS count
      FROM subscription_checks WHERE has_access = 1 AND checked_at >= ? GROUP BY day
    `, since)),
  };
}

export function readOverview(repository: AdminCrmRepository, now = new Date()) {
  const counts = segmentCounts(repository);
  const monthAgo = new Date(now.getTime() - 30 * DAY_MS).toISOString();
  const twoMonthsAgo = new Date(now.getTime() - 60 * DAY_MS).toISOString();
  const previous = num(repository.get('SELECT COUNT(*) AS count FROM users WHERE created_at >= ? AND created_at < ?', twoMonthsAgo, monthAgo)?.count);
  const alerts = [...integrationAlerts(repository, now), ...workAlerts(repository, counts, now)]
    .sort((left, right) => SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity]);
  return {
    generatedAt: now.toISOString(),
    alerts,
    kpis: {
      totalUsers: counts.all ?? 0,
      // «С доступом сейчас» = provider access or an active manual grant; both parts are reported
      // so the card agrees with the `paying` and `manual` segments it links to.
      payingNow: counts.paying_now ?? 0,
      payingProvider: counts.paying ?? 0,
      manualAccess: counts.manual ?? 0,
      newUsers30d: num(repository.get('SELECT COUNT(*) AS count FROM users WHERE created_at >= ?', monthAgo)?.count),
      newUsersPrevious30d: previous,
      lapsed30d: counts.lapsed ?? 0,
      expiringSoon: counts.expiring ?? 0,
    },
    series: dailySeries(repository, now),
    activity: readActivity(repository),
  };
}

export type AdminCrmOverview = ReturnType<typeof readOverview>;
