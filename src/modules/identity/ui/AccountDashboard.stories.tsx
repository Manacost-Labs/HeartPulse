import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import type { SubscriptionStatus } from '../../subscriptions/public';
import type { AuthUser } from '../model/authUser';
import AccountDashboard, { type AccountDashboardProps } from './AccountDashboard';

const nextMonth = new Date(Date.now() + 22 * 86_400_000).toISOString();

const subscriber: SubscriptionStatus = {
  hasAccess: true,
  source: 'boosty',
  checkedAt: new Date().toISOString(),
  stale: false,
  message: 'Boosty подписка подтверждена.',
  entitlements: { arena: true, battlegrounds: true, standard: true, contests: true, guidesArchive: true, arenaArticles: true, battlegroundsArticles: true },
  boosty: { checked: true, found: true, hasAccess: true, email: 'subscriber@example.test', price: 300, levelName: 'Мастер арены', dates: { nextPaymentAt: nextMonth }, willRenew: true },
  patreon: {},
  telegram: {},
};

const reader: SubscriptionStatus = {
  hasAccess: false,
  source: 'none',
  checkedAt: new Date().toISOString(),
  stale: false,
  message: 'Подписка не найдена.',
  entitlements: {},
  boosty: { checked: true, found: false, hasAccess: false, message: 'Почта подписки не подтверждена' },
  patreon: {},
  telegram: {},
};

const user: AuthUser = {
  id: 'u-story',
  publicProfileId: '77',
  email: 'subscriber@example.test',
  name: 'Подписчик Арены',
  role: 'user',
  avatarInitials: 'ПА',
  telegramLinked: true,
  telegramUsername: 'arena_fan',
};

const social = {
  providers: [
    { provider: 'google', authUrl: '/api/auth/google/start' },
    { provider: 'discord', authUrl: '/api/auth/discord/start' },
    { provider: 'yandex', authUrl: '/api/auth/yandex/start' },
  ],
  linked: new Set(['email', 'telegram', 'google']),
};

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const sessions = {
  sessions: [
    { id: 'story-this-browser-0001', current: true, device: 'Chrome · Windows', place: 'Россия', signedInAt: minutesAgo(9000), lastActiveAt: minutesAgo(0) },
    { id: 'story-phone-session-001', current: false, device: 'Safari · iPhone', place: 'Европа', signedInAt: minutesAgo(4000), lastActiveAt: minutesAgo(12) },
    { id: 'story-laptop-session-01', current: false, device: 'Firefox · Linux', place: null, signedInAt: minutesAgo(30000), lastActiveAt: null },
  ],
  failed: false,
  busy: null,
  revoke: fn(),
  revokeOthers: fn(),
};

const args: AccountDashboardProps = {
  user,
  name: user.name,
  contact: user.email,
  message: null,
  subscription: subscriber,
  subscriptionLoading: false,
  subscriptionChecked: true,
  checkedAt: '21.10, 15:40',
  onRefreshSubscription: fn(),
  boosty: { email: 'subscriber@example.test', code: '', step: 'email', busy: false, onEmailChange: fn(), onCodeChange: fn(), onSubmit: fn() },
  patreonLinkUrl: '/api/auth/patreon/start',
  telegram: { userId: 'u-story', mode: 'oidc', botUsername: 'kolodahearthstoneauthbot', onMessage: fn() },
  social,
  sessions,
  contests: {
    loading: false,
    entries: [{ id: 'e1', contestId: 'c1', title: 'Розыгрыш наборов «Тёмная империя»', prize: '5 наборов', imageUrl: '', status: 'completed', entryStatus: 'approved', joinedAt: '2026-10-02T10:00:00.000Z', isWinner: true }],
  },
  settings: {
    values: { country: 'Россия', telegram: 'arena_fan', vkUrl: '', contactEmail: 'subscriber@example.test', newsletter: true },
    countries: ['Россия', 'Беларусь', 'Казахстан'],
    saving: false,
    onChange: fn(),
    onSubmit: fn(),
  },
  onLogout: fn(),
};

const meta = {
  title: 'Identity/Account Dashboard',
  component: AccountDashboard,
  args,
  // The module's own presentation: the page composes the Valyro plan card into
  // it (Features/Account Billing Plan Card, Profile/Account workspace).
  parameters: { layout: 'padded' },
} satisfies Meta<typeof AccountDashboard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Subscriber: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/Следующий платёж/)).toBeVisible();
    await expect(canvas.getByRole('link', { name: /Управлять на Boosty/ })).toHaveAttribute('href', 'https://boosty.to/kolodahearthstone');
  },
};

export const SubscriptionWillNotRenew: Story = {
  args: { subscription: { ...subscriber, boosty: { ...subscriber.boosty, willRenew: false } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/Доступ до/)).toBeVisible();
  },
};

export const WithoutSubscription: Story = {
  args: {
    user: { ...user, telegramLinked: false, telegramUsername: '' },
    subscription: reader,
    social: { ...social, linked: new Set(['email']) },
    contests: { loading: false, entries: [] },
  },
};

export const Checking: Story = {
  args: { subscription: null, subscriptionChecked: false, subscriptionLoading: true, checkedAt: '' },
};

export const CheckFailed: Story = {
  args: { subscription: null, subscriptionChecked: true, checkedAt: '' },
};


export const EndingOtherSessions: Story = {
  play: async ({ canvas, userEvent, args: storyArgs }) => {
    await expect(canvas.getByText('Этот браузер')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Выйти на всех других устройствах' }));
    await expect(canvas.getByRole('alertdialog')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Завершить' }));
    await expect(storyArgs.sessions?.revokeOthers).toHaveBeenCalled();
  },
};
