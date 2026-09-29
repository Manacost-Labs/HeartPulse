import type { AdminCrmPerson } from '../api/adminCrmClient';

const SOURCE_LABELS: Record<string, string> = {
  boosty: 'Boosty',
  telegram: 'Telegram VIP',
  patreon: 'Patreon',
  tribute: 'Tribute',
  'manual-access': 'Выдан вручную',
  none: 'Нет подписки',
};

export function accessSourceLabel(source: string): string {
  const parts = source.split(',').map(part => part.trim()).filter(part => part && part !== 'none');
  if (!parts.length) return SOURCE_LABELS.none;
  return parts.map(part => SOURCE_LABELS[part] ?? part).join(' + ');
}

const PROVIDER_LABELS: Record<string, string> = {
  telegram: 'Telegram',
  telegram_oidc: 'Telegram (вход)',
  'boosty-email': 'Boosty (email)',
  patreon: 'Patreon',
};

export const identityProviderLabel = (provider: string) => PROVIDER_LABELS[provider] ?? provider;

const CONTEST_STATUS_LABELS: Record<string, string> = {
  approved: 'одобрена', pending: 'на проверке', rejected: 'отклонена', winner: 'победитель',
};

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function describeUserUpdate(details: Record<string, unknown>): string {
  const parts: string[] = [];
  const role = details.role;
  if (isRecord(role)) parts.push(role.to === 'admin' ? 'назначен администратором' : 'сняты права администратора');
  const blocked = details.blocked;
  if (isRecord(blocked)) parts.push(blocked.to ? 'заблокирован' : 'разблокирован');
  const manual = details.manualAccess;
  if (isRecord(manual) && isRecord(manual.to)) {
    if (!manual.to.enabled) parts.push('отозван ручной доступ');
    else if (typeof manual.to.expiresAt === 'string') parts.push(`выдан доступ до ${formatDate(manual.to.expiresAt)}`);
    else parts.push('выдан доступ навсегда');
  }
  return parts.length ? parts.join(', ') : 'изменён профиль';
}

const ACTION_LABELS: Record<string, string> = {
  'api-key.created': 'создан ключ Public API',
  'api-key.revoked': 'отозван ключ Public API',
  'archetype-translation.created': 'добавлен перевод архетипа',
  'archetype-translation.updated': 'изменён перевод архетипа',
  'archetype-translation.synced': 'переводы архетипов синхронизированы',
  'mechanic-translation.updated': 'изменён перевод механики',
  'mailing.queued': 'рассылка поставлена в очередь',
  'mailing.test-sent': 'отправлено тестовое письмо',
  'standard-cache.reset': 'сброшен кеш данных Стандарта',
};

export function auditActionLabel(action: string, details: Record<string, unknown>): string {
  if (action === 'user.updated') return describeUserUpdate(details);
  if (action === 'user.note.added') return 'добавлена заметка';
  if (action === 'user.note.deleted') return 'удалена заметка';
  const known = ACTION_LABELS[action];
  if (known) return known;
  if (action.startsWith('parser-control.')) return 'изменены настройки парсеров';
  if (action === 'user.tags.updated') {
    const tags = Array.isArray(details.to) ? details.to.map(String) : [];
    return tags.length ? `теги: ${tags.join(', ')}` : 'теги очищены';
  }
  return action;
}

export function formatDate(value: string | null | undefined, withTime = false): string {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleString('ru-RU', {
    day: 'numeric', month: 'short', year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

/** Whole days until `value`; negative once it has passed. */
export function daysUntil(value: string | null | undefined, now = Date.now()): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? Math.ceil((time - now) / 86_400_000) : null;
}

export const upperFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export type TimelineTone = 'good' | 'bad' | 'neutral';
export type TimelineEvent = { key: string; at: string; title: string; detail: string; tone: TimelineTone };

/** One chronological story for the card: registration, access changes, contests and admin actions. */
export function buildPersonTimeline(card: AdminCrmPerson): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  if (card.person.createdAt) {
    events.push({ key: 'created', at: card.person.createdAt, title: 'Зарегистрировался', detail: '', tone: 'neutral' });
  }
  card.accessHistory.forEach((entry, index) => {
    events.push({
      key: `access-${index}`,
      at: entry.at,
      title: entry.hasAccess ? 'Появился доступ' : 'Доступ пропал',
      detail: accessSourceLabel(entry.source),
      tone: entry.hasAccess ? 'good' : 'bad',
    });
  });
  for (const entry of card.contests) {
    events.push({
      key: `contest-${entry.contestId}`,
      at: entry.createdAt,
      title: `Конкурс «${entry.title}»`,
      detail: `заявка ${CONTEST_STATUS_LABELS[entry.status] ?? entry.status}`,
      tone: 'neutral',
    });
  }
  for (const entry of card.audit) {
    events.push({
      key: `audit-${entry.id}`,
      at: entry.createdAt,
      title: upperFirst(auditActionLabel(entry.action, entry.details)),
      detail: `администратор ${entry.actorName}`,
      tone: 'neutral',
    });
  }
  return events
    .filter(event => Number.isFinite(new Date(event.at).getTime()))
    .sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime());
}

export type AccessBadge = { tone: 'ok' | 'warn' | 'bad' | 'muted'; text: string };

/** The one status an operator reads first: blocked, manual expiry, provider access, lost access or none. */
export function accessBadge(card: AdminCrmPerson, now = Date.now()): AccessBadge {
  if (card.person.blockedAt) return { tone: 'bad', text: 'Заблокирован' };
  const manual = card.access.manual;
  if (manual?.active) {
    const days = daysUntil(manual.expiresAt, now);
    if (days === null) return { tone: 'ok', text: 'Доступ навсегда' };
    if (days <= 7) return { tone: 'warn', text: `Доступ истекает через ${days} дн.` };
    return { tone: 'ok', text: `Доступ до ${formatDate(manual.expiresAt)}` };
  }
  if (card.access.hasAccess) return { tone: 'ok', text: 'Есть доступ' };
  if (card.accessHistory.some(entry => entry.hasAccess)) return { tone: 'bad', text: 'Доступ пропал' };
  return { tone: 'muted', text: 'Без доступа' };
}
