export type ConnectUser = {
  id?: string;
  email: string;
  name: string;
  role: string;
  avatarInitials?: string;
};

export type { DeviceAuthorization } from './schema/deviceAuthorization';

export type ConnectState =
  | 'entry'
  | 'loading'
  | 'review'
  | 'submitting'
  | 'approved'
  | 'denied'
  | 'error';

export const SCOPE_LABELS: Readonly<Record<string, string>> = {
  'profile.read': 'Имя, e-mail и публичный ID профиля',
  'subscription.read': 'Статус подписки и доступные разделы',
  'catalog.read': 'Каталог данных Manacost API',
  'images.read': 'Изображения карт через защищённый API',
  'statistics.read': 'Статистика карт и история показателей',
};

const CONNECT_EXPIRY_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
});

export function formatConnectExpiry(expiresAt: number): string {
  return CONNECT_EXPIRY_FORMATTER.format(new Date(expiresAt));
}

/** Formats the human-readable code without accepting ambiguous symbols. */
export function normalizedUserCode(value: string): string {
  const compact = value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 8);
  return compact.length > 4 ? `${compact.slice(0, 4)}-${compact.slice(4)}` : compact;
}
