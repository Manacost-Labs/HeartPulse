import { pluralRu } from '../../../shared/text/pluralRu';

/** One signed-in browser of the account (`GET /api/account/sessions`). */
export type AccountSession = {
  id: string;
  current: boolean;
  device: string;
  place: string | null;
  signedInAt: string;
  lastActiveAt: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The session list from an answer, or null when the answer is not one. */
export function accountSessionsFromPayload(payload: unknown): AccountSession[] | null {
  const sessions = isRecord(payload) ? payload.sessions : null;
  if (!Array.isArray(sessions)) return null;
  return sessions.filter(isRecord).filter(item => typeof item.id === 'string').map(item => ({
    id: String(item.id),
    current: item.current === true,
    device: typeof item.device === 'string' ? item.device : '',
    place: typeof item.place === 'string' && item.place ? item.place : null,
    signedInAt: typeof item.signedInAt === 'string' ? item.signedInAt : '',
    lastActiveAt: typeof item.lastActiveAt === 'string' ? item.lastActiveAt : null,
  }));
}

const DAY_FORMAT = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'Europe/Moscow' });

/** «Россия · активен 12 мин назад»: where and when, without what the row already says. */
export function accountSessionDetail(session: AccountSession, now: number): string {
  const activeAt = Date.parse(session.lastActiveAt ?? '');
  let when = '';
  if (Number.isFinite(activeAt)) {
    const minutes = Math.max(0, Math.floor((now - activeAt) / 60_000));
    const hours = Math.floor(minutes / 60);
    if (minutes < 1) when = 'активен только что';
    else if (minutes < 60) when = `активен ${minutes} мин назад`;
    else if (hours < 24) when = `активен ${hours} ч назад`;
    else when = `активен ${DAY_FORMAT.format(activeAt)}`;
  } else {
    const signedInAt = Date.parse(session.signedInAt);
    if (Number.isFinite(signedInAt)) when = `вход ${DAY_FORMAT.format(signedInAt)}`;
  }
  return [session.place, when].filter(Boolean).join(' · ');
}

export function accountSessionDevice(session: AccountSession): string {
  return session.device || 'Неизвестное устройство';
}

/** True when the device is a phone or tablet, for the row's icon. */
export function isHandheldSession(session: AccountSession): boolean {
  return /iPhone|iPad|Android/.test(session.device);
}

export function revokedSessionsMessage(count: number): string {
  if (count === 0) return 'Других сеансов не было.';
  return `Завершено ${count} ${pluralRu(count, 'сеанс', 'сеанса', 'сеансов')}.`;
}
