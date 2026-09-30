/**
 * View model for the admin Boosty and Telegram lists: payload types, filter chips with counts,
 * search, and one plain-language status per row. Pure functions so the tables stay thin.
 */
export type BoostyAdminStatus = {
  configured: boolean;
  ok: boolean;
  importStatus: string;
  source: string;
  stale: boolean;
  snapshotAgeSeconds: number | null;
  lastErrorCategory: string | null;
  lastErrorMessage: string | null;
  warnings: string[];
  summary: {
    active?: number;
    activePaid?: number;
    boostyPaid?: number;
    total?: number;
    [key: string]: unknown;
  };
  checkedAt?: string;
  graceHours?: number;
};

export type BoostySubscriberRow = {
  id: string;
  name: string;
  email: string;
  hasEmail: boolean;
  avatarUrl: string;
  status: string;
  subscribed: boolean;
  active: boolean;
  paid: boolean;
  hasActivePaidAccess: boolean;
  willRenew: boolean;
  blacklisted: boolean;
  canWrite: boolean;
  audienceType: string;
  contactStatus: string;
  level: { id: number | string | null; name: string; price: number; currency: string };
  money: { currentPrice: number; totalPayments: number; currency: string };
  dates: { subscribedAt: string | null; unsubscribedAt: string | null; nextPaymentAt: string | null };
  entitlements?: Partial<Record<string, boolean>>;
  siteAccess: boolean;
};

export type BoostySubscribersPayload = {
  configured: boolean;
  source: string;
  stale: boolean;
  summary: BoostyAdminStatus['summary'];
  levels: Record<string, number>;
  subscribers: BoostySubscriberRow[];
  fetchedAt: string;
  error?: string;
};

export type TelegramAdminAccount = {
  id: string;
  profileId: string;
  name: string;
  email: string;
  role: string;
  blockedAt: string;
  telegramId: string;
  telegramOidcId: string;
  telegramUsername: string;
  contactTelegram: string;
  photoUrl: string;
  hasTelegramIdentity: boolean;
  hasContactOnly: boolean;
  canBeChecked: boolean;
  hasAccess: boolean;
  telegramHasAccess: boolean;
  accessState: 'access' | 'checkable' | 'contact-only' | 'no-access' | 'blocked';
  source: string;
  message: string;
  checkedAt: string;
  updatedAt: string;
  stale: boolean;
  entitlements?: Partial<Record<string, boolean>>;
  chats: Array<Record<string, unknown>>;
  boostyHasAccess: boolean;
  createdAt: string;
  userUpdatedAt: string;
};

export type TelegramAccountsPayload = {
  configured: boolean;
  chatIds: string[];
  summary: { total: number; access: number; checkable: number; contactOnly: number; stale: number; blocked: number };
  accounts: TelegramAdminAccount[];
  fetchedAt: string;
  error?: string;
};

export type ListTone = 'ok' | 'warn' | 'bad' | 'muted';
export type FilterOption<Id extends string> = { id: Id; label: string; count: number };

export type BoostyAccessFilter = 'all' | 'site' | 'paid' | 'free' | 'inactive';
export const BOOSTY_NO_LEVEL = 'Без уровня';

const BOOSTY_FILTERS: Array<{ id: BoostyAccessFilter; label: string; match: (row: BoostySubscriberRow) => boolean }> = [
  { id: 'all', label: 'Все', match: () => true },
  { id: 'site', label: 'Открывают сайт', match: row => row.siteAccess },
  { id: 'paid', label: 'Платят', match: row => row.hasActivePaidAccess },
  { id: 'free', label: 'Без платной подписки', match: row => !row.hasActivePaidAccess },
  { id: 'inactive', label: 'Не активны', match: row => !row.active },
];

export function boostyFilterOptions(rows: BoostySubscriberRow[]): Array<FilterOption<BoostyAccessFilter>> {
  return BOOSTY_FILTERS.map(filter => ({ id: filter.id, label: filter.label, count: rows.filter(filter.match).length }));
}

export function filterBoostySubscribers(
  rows: BoostySubscriberRow[],
  filters: { search: string; level: string; access: BoostyAccessFilter },
): BoostySubscriberRow[] {
  const query = filters.search.trim().toLowerCase();
  const access = BOOSTY_FILTERS.find(filter => filter.id === filters.access) ?? BOOSTY_FILTERS[0];
  return rows.filter(row => {
    if (filters.level !== 'all' && (row.level?.name || BOOSTY_NO_LEVEL) !== filters.level) return false;
    if (!access.match(row)) return false;
    if (!query) return true;
    return [row.id, row.name, row.email, row.level?.name, row.status, row.audienceType].filter(Boolean).join(' ').toLowerCase().includes(query);
  });
}

export function boostySubscription(row: BoostySubscriberRow): { tone: ListTone; label: string; detail: string } {
  if (!row.active) return { tone: 'muted', label: 'Не активна', detail: '' };
  // A follower without a paid level is "active" for Boosty but pays nothing.
  if (!row.hasActivePaidAccess) return { tone: 'muted', label: 'Бесплатная', detail: '' };
  return row.willRenew
    ? { tone: 'ok', label: 'Активна', detail: 'автопродление включено' }
    : { tone: 'warn', label: 'Активна', detail: 'автопродление выключено' };
}

/** Whether the Boosty level maps to site access; a paying subscriber without a mapped level needs attention. */
export function boostySiteAccess(row: BoostySubscriberRow): { tone: ListTone; label: string; detail: string } {
  if (row.siteAccess) return { tone: 'ok', label: 'Открывает сайт', detail: '' };
  if (row.hasActivePaidAccess) return { tone: 'warn', label: 'Тариф не распознан', detail: 'платит, но разделы сайта не открыты' };
  return { tone: 'muted', label: 'Не открывает сайт', detail: '' };
}

export type TelegramAccessFilter = 'all' | 'access' | 'checkable' | 'contact-only' | 'stale' | 'blocked';

const TELEGRAM_FILTERS: Array<{ id: TelegramAccessFilter; label: string; match: (account: TelegramAdminAccount) => boolean }> = [
  { id: 'all', label: 'Все', match: () => true },
  { id: 'access', label: 'С доступом', match: account => account.telegramHasAccess },
  { id: 'checkable', label: 'Привязан, без доступа', match: account => account.accessState === 'checkable' },
  { id: 'contact-only', label: 'Не привязан', match: account => account.accessState === 'contact-only' },
  { id: 'stale', label: 'Проверка устарела', match: account => account.stale },
  { id: 'blocked', label: 'Заблокированы', match: account => account.accessState === 'blocked' },
];

export function telegramFilterOptions(accounts: TelegramAdminAccount[]): Array<FilterOption<TelegramAccessFilter>> {
  return TELEGRAM_FILTERS.map(filter => ({ id: filter.id, label: filter.label, count: accounts.filter(filter.match).length }));
}

export function filterTelegramAccounts(
  accounts: TelegramAdminAccount[],
  filters: { search: string; access: TelegramAccessFilter },
): TelegramAdminAccount[] {
  const query = filters.search.trim().toLowerCase();
  const access = TELEGRAM_FILTERS.find(filter => filter.id === filters.access) ?? TELEGRAM_FILTERS[0];
  return accounts.filter(account => {
    if (!access.match(account)) return false;
    if (!query) return true;
    return [account.id, account.profileId, account.name, account.email, account.telegramId, account.telegramOidcId,
      account.telegramUsername, account.contactTelegram, account.source, account.message]
      .filter(Boolean).join(' ').toLowerCase().includes(query);
  });
}

const TELEGRAM_ACCESS: Record<TelegramAdminAccount['accessState'], { tone: ListTone; label: string }> = {
  access: { tone: 'ok', label: 'Есть доступ' },
  checkable: { tone: 'muted', label: 'Нет в VIP-группах' },
  'contact-only': { tone: 'warn', label: 'Telegram не привязан' },
  blocked: { tone: 'bad', label: 'Заблокирован' },
  'no-access': { tone: 'muted', label: 'Нет доступа' },
};

export const telegramAccess = (account: TelegramAdminAccount) => TELEGRAM_ACCESS[account.accessState] ?? TELEGRAM_ACCESS['no-access'];

const CHAT_STATUS_LABEL: Record<string, string> = {
  creator: 'владелец группы', administrator: 'администратор группы', member: 'состоит', restricted: 'состоит с ограничениями',
  left: 'вышел из группы', kicked: 'исключён из группы',
};

/** Telegram's member status or error for one VIP group, in words an operator can act on. */
export function chatStateLabel(chat: Record<string, unknown>): { member: boolean; label: string } {
  const member = Boolean(chat.isMember || chat.hasAccess);
  const error = String(chat.error || '');
  if (/chat not found|kicked|forbidden/i.test(error)) return { member: false, label: 'бот не видит эту группу' };
  if (error) return { member: false, label: `ошибка проверки: ${error}` };
  const status = String(chat.status || '');
  if (CHAT_STATUS_LABEL[status]) return { member, label: CHAT_STATUS_LABEL[status] };
  return { member, label: member ? 'состоит' : 'не состоит' };
}

/** VIP groups the bot could not read for at least half of the accounts it checked there. */
export function unreadableTelegramChats(accounts: TelegramAdminAccount[]): string[] {
  const chats = new Map<string, { checks: number; unreadable: number }>();
  for (const account of accounts) {
    for (const chat of account.chats) {
      const id = String(chat.chatId || chat.id || '');
      if (!id) continue;
      const entry = chats.get(id) ?? { checks: 0, unreadable: 0 };
      entry.checks += 1;
      if (chatStateLabel(chat).label === 'бот не видит эту группу') entry.unreadable += 1;
      chats.set(id, entry);
    }
  }
  return [...chats].filter(([, entry]) => entry.unreadable > 0 && entry.unreadable * 2 >= entry.checks).map(([id]) => id);
}
