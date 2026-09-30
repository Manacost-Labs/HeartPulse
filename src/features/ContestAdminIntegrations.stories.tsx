import type { Meta, StoryObj } from '@storybook/react-vite';
import { ContestAdminBoosty } from './ContestAdminBoosty';
import { ContestAdminTelegram } from './ContestAdminTelegram';
import type { BoostySubscriberRow, TelegramAdminAccount } from './adminIntegrationListModel';
import './contests.css';
import '../modules/adminWorkspace/public.css';

// Invented workshop data; not real subscribers.
const subscriber = (id: string, values: Partial<BoostySubscriberRow> = {}): BoostySubscriberRow => ({
  id, name: id, email: `${id}@example.test`, hasEmail: true, avatarUrl: '', status: 'active', subscribed: true, active: true, paid: true,
  hasActivePaidAccess: true, willRenew: true, blacklisted: false, canWrite: true, audienceType: 'boosty-paid', contactStatus: '',
  level: { id: 1, name: 'Легенда', price: 500, currency: 'RUB' }, money: { currentPrice: 500, totalPayments: 1500, currency: 'RUB' },
  dates: { subscribedAt: '2026-01-10T00:00:00.000Z', unsubscribedAt: null, nextPaymentAt: '2026-10-14T00:00:00.000Z' }, siteAccess: true, ...values,
});
const subscribers = [
  subscriber('igrok_7731'),
  subscriber('arena_wizard', { willRenew: false, level: { id: 2, name: 'Мастер', price: 250, currency: 'RUB' }, money: { currentPrice: 250, totalPayments: 750, currency: 'RUB' } }),
  subscriber('old_tier', { siteAccess: false, level: { id: 3, name: 'Старый тариф', price: 100, currency: 'RUB' }, money: { currentPrice: 100, totalPayments: 300, currency: 'RUB' } }),
  subscriber('follower', { email: '', hasEmail: false, hasActivePaidAccess: false, siteAccess: false, paid: false, level: { id: null, name: '', price: 0, currency: 'RUB' }, money: { currentPrice: 0, totalPayments: 0, currency: 'RUB' }, dates: { subscribedAt: '2026-08-01T00:00:00.000Z', unsubscribedAt: null, nextPaymentAt: null } }),
  subscriber('deck_master', { active: false, hasActivePaidAccess: false, siteAccess: false, willRenew: false, status: 'inactive', dates: { subscribedAt: '2025-06-05T00:00:00.000Z', unsubscribedAt: '2026-09-29T00:00:00.000Z', nextPaymentAt: null } }),
];

const account = (id: string, values: Partial<TelegramAdminAccount> = {}): TelegramAdminAccount => ({
  id, profileId: id.toUpperCase(), name: id, email: `${id}@example.test`, role: 'user', blockedAt: '', telegramId: '10001', telegramOidcId: 'oidc',
  telegramUsername: id, contactTelegram: id, photoUrl: '', hasTelegramIdentity: true, hasContactOnly: false, canBeChecked: true, hasAccess: true,
  telegramHasAccess: true, accessState: 'access', source: 'telegram', message: '', checkedAt: '2026-09-30T08:00:00.000Z', updatedAt: '', stale: false,
  entitlements: { arena: true }, chats: [{ chatId: '-1002311131780', status: 'member', isMember: true }, { chatId: '-5077378176', ok: false, error: 'Bad Request: chat not found' }],
  boostyHasAccess: false, createdAt: '', userUpdatedAt: '', ...values,
});
const accounts = [
  account('igrok_7731'),
  account('kolodnik_ru', { telegramHasAccess: false, hasAccess: false, accessState: 'checkable', entitlements: {}, chats: [{ chatId: '-1002311131780', status: 'left' }, { chatId: '-5077378176', ok: false, error: 'Bad Request: chat not found' }] }),
  account('nick_only', { telegramId: '', telegramOidcId: '', telegramHasAccess: false, hasAccess: false, accessState: 'contact-only', entitlements: {}, chats: [], stale: true, checkedAt: '' }),
];

const frame = (Story: () => React.ReactNode) => (
  <main className="admin-workspace-page admin-tailadmin-shell" style={{ minHeight: '100vh', padding: 24 }}>
    <Story />
  </main>
);
const formatDate = (value: string | null) => (value ? new Date(value).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'нет данных');

const meta = { title: 'Admin/Integration lists', decorators: [frame], parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Boosty: Story = {
  render: () => (
    <ContestAdminBoosty
      status={{ configured: true, ok: true, importStatus: 'ok', source: 'snapshot', stale: false, snapshotAgeSeconds: 120, lastErrorCategory: null, lastErrorMessage: null, warnings: [], summary: {}, checkedAt: '2026-09-30T08:00:00.000Z', graceHours: 24 }}
      statusLoading={false}
      subscribers={{ configured: true, source: 'snapshot', stale: false, summary: {}, levels: { Легенда: 2, Мастер: 1, 'Старый тариф': 1, '': 1 }, subscribers, fetchedAt: '2026-09-30T08:00:00.000Z' }}
      subscribersLoading={false}
      onReload={() => undefined}
      formatDate={formatDate}
      entitlementLabels={row => (row.siteAccess ? ['Арена', 'Стандарт'] : [])}
    />
  ),
};

export const Telegram: Story = {
  render: () => (
    <ContestAdminTelegram
      payload={{ configured: true, chatIds: ['-1002311131780', '-5077378176'], summary: { total: 3, access: 1, checkable: 2, contactOnly: 1, stale: 1, blocked: 0 }, accounts, fetchedAt: '2026-09-30T08:00:00.000Z' }}
      loading={false}
      onReload={() => undefined}
      formatDate={formatDate}
      entitlementLabels={row => (row.hasAccess ? ['Арена', 'Стандарт'] : [])}
    />
  ),
};
