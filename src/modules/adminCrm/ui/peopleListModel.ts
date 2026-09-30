import { accessSourceLabel, daysUntil, formatDate } from './adminClientCardModel';

/** The fields of an admin user list row that the people table needs. */
export type PeopleListUser = {
  name: string;
  email: string;
  role: string;
  blockedAt?: string;
  lifetimeAccess?: boolean;
  manualAccess?: { enabled: boolean; expiresAt: string | null };
  subscription: { hasAccess: boolean; source: string };
  telegramUsername?: string;
  telegramId?: string;
  contactTelegram?: string;
  contactVkUrl?: string;
  contactEmail?: string;
};

export type PersonAccess = { tone: 'ok' | 'warn' | 'bad' | 'muted'; label: string; detail: string };

const providerSources = (source: string) => source.split(',').map(part => part.trim()).filter(part => part && part !== 'none' && part !== 'manual-access').join(',');

/** One status per person for the list: block, manual access with its expiry, provider access, or none. */
export function personAccess(user: PeopleListUser, now = Date.now()): PersonAccess {
  if (user.blockedAt) {
    // A block closes sign-in but does not remove access; say what unblocking would restore.
    const kept = user.manualAccess?.enabled ? 'ручной доступ сохранён' : user.subscription.hasAccess ? 'подписка сохранена' : '';
    return { tone: 'bad', label: 'Заблокирован', detail: kept };
  }
  if (user.manualAccess?.enabled) {
    const providers = providerSources(user.subscription.source);
    const detail = providers ? `выдан вручную + ${accessSourceLabel(providers)}` : 'выдан вручную';
    const days = daysUntil(user.manualAccess.expiresAt, now);
    if (days === null) return { tone: 'ok', label: 'Доступ навсегда', detail };
    if (days <= 7) return { tone: 'warn', label: `Истекает через ${Math.max(days, 0)} дн.`, detail };
    return { tone: 'ok', label: `До ${formatDate(user.manualAccess.expiresAt)}`, detail };
  }
  if (user.subscription.hasAccess) return { tone: 'ok', label: 'Подписка', detail: accessSourceLabel(user.subscription.source) };
  return { tone: 'muted', label: 'Нет доступа', detail: '' };
}

/** Ways to reach the person, without repeating the account email shown under the name. */
export function personContacts(user: PeopleListUser): Array<{ kind: string; value: string }> {
  const contacts: Array<{ kind: string; value: string }> = [];
  const telegram = user.contactTelegram || (user.telegramUsername ? `@${user.telegramUsername}` : user.telegramId ? `ID ${user.telegramId}` : '');
  if (telegram) contacts.push({ kind: 'Telegram', value: telegram });
  if (user.contactVkUrl) contacts.push({ kind: 'VK', value: user.contactVkUrl.replace(/^https?:\/\/(www\.)?/, '') });
  if (user.contactEmail && user.contactEmail !== user.email) contacts.push({ kind: 'Почта для связи', value: user.contactEmail });
  return contacts;
}

export function personInitial(user: Pick<PeopleListUser, 'name' | 'email'>): string {
  return (user.name || user.email).trim().slice(0, 1).toUpperCase() || '?';
}
