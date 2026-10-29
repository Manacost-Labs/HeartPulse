import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import { AdminOverviewPage, type AdminOverviewPageProps } from './AdminOverviewPage';
import type { AdminCrmOverview } from './overviewModel';

// Invented workshop data; not real users or revenue.
const now = Date.now();
const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
const days = Array.from({ length: 30 }, (_, index) => new Date(now - (29 - index) * 86_400_000).toISOString().slice(0, 10));
const wave = (base: number, spread: number) => days.map((_, index) => Math.round(base + Math.sin(index / 3) * spread + index * spread / 15));

const overview: AdminCrmOverview = {
  generatedAt: ago(1),
  alerts: [
    { id: 'telegram-chat:-5077378176', severity: 'critical', title: 'Бот не видит VIP-группу Telegram -5077378176', detail: '200 из 200 проверок за 2 часа: Bad Request: chat not found. Участники только этой группы не получают доступ.', action: { section: 'telegram', label: 'Открыть Telegram' } },
    { id: 'expiring-access', severity: 'warning', title: '14 ручных доступов истекают в ближайшие 7 дней', detail: 'Продлите доступ тем, кому он ещё нужен, пока он не закрылся.', action: { section: 'users', segment: 'expiring', label: 'Показать' } },
    { id: 'lapsed-access', severity: 'info', title: '63 человека потеряли доступ за 30 дней', detail: 'Им можно написать и предложить вернуться.', action: { section: 'users', segment: 'lapsed', label: 'Показать' } },
  ],
  kpis: { totalUsers: 8412, payingNow: 1284, payingProvider: 1243, manualAccess: 41, newUsers30d: 537, newUsersPrevious30d: 560, lapsed30d: 63, expiringSoon: 14 },
  series: { days, newUsers: wave(18, 5), paying: wave(1240, 20) },
  activity: [
    { id: 'r1', kind: 'registration', at: ago(4), name: 'novichok_42', userId: 'u1' },
    { id: 'a1', kind: 'admin', at: ago(22), action: 'user.updated', details: { manualAccess: { to: { enabled: true, expiresAt: ago(-43_200) } } }, actorName: 'Администратор', targetName: 'kolodnik_ru', userId: 'u2' },
    { id: 'c1', kind: 'contest', at: ago(95), name: 'igrok_7731', contestTitle: 'Арена-марафон', status: 'pending', userId: 'u3' },
    { id: 'm1', kind: 'mailing', at: ago(60 * 26), subject: 'Мета недели', accepted: 2341, failed: 3 },
    { id: 'a2', kind: 'admin', at: ago(60 * 30), action: 'archetype-translation.synced', details: {}, actorName: 'Администратор', targetName: '' },
  ],
};

const client = (value: AdminCrmOverview): NonNullable<AdminOverviewPageProps['client']> => ({
  overview: async () => value,
});

const meta = {
  title: 'Admin/CRM/Overview',
  component: AdminOverviewPage,
  parameters: { layout: 'padded' },
  args: { client: client(overview), onNavigate: fn(), onOpenSegment: fn() },
} satisfies Meta<typeof AdminOverviewPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NeedsAttention: Story = {
  play: async ({ canvas, args }) => {
    await expect(await canvas.findByRole('img', { name: 'Регистрации по дням' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Скачать Регистрации по дням: SVG' })).toBeEnabled();
    await userEvent.click(canvas.getByRole('button', { name: 'Платящие' }));
    await expect(args.onOpenSegment).toHaveBeenCalledWith('paying');
    await userEvent.click(canvas.getByRole('button', { name: 'Ручной доступ' }));
    await expect(args.onOpenSegment).toHaveBeenCalledWith('manual');
    await userEvent.click(canvas.getByRole('button', { name: 'Новые за 7 дней' }));
    await expect(args.onOpenSegment).toHaveBeenCalledWith('new');
  },
};
export const AllCalm: Story = { args: { client: client({ ...overview, alerts: [] }) }, play: NeedsAttention.play };

export const EmptyHistory: Story = {
  args: { client: client({ ...overview, alerts: [], series: { days: [], paying: [], newUsers: [] } }) },
  play: async ({ canvas }) => {
    await expect((await canvas.findAllByText('Для графика пока нет данных.'))).toHaveLength(2);
    await expect(canvas.getByRole('button', { name: 'Скачать Регистрации по дням: PNG' })).toBeDisabled();
  },
};

export const SingleDay: Story = {
  args: { client: client({ ...overview, alerts: [], series: { days: [days[0]], paying: [1240], newUsers: [0] } }) },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('img', { name: 'Регистрации по дням' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Скачать Регистрации по дням: SVG' })).toBeEnabled();
  },
};

export const Loading: Story = {
  args: { client: { overview: () => new Promise(() => {}) } },
  play: async ({ canvas, args }) => {
    await expect(await canvas.findByRole('status')).toHaveTextContent('Загружаем обзор');
    await userEvent.click(canvas.getByRole('button', { name: /Пользователи Поиск/ }));
    await expect(args.onNavigate).toHaveBeenCalledWith('users');
    await expect(canvas.getByRole('button', { name: /Обновить/ })).toBeDisabled();
  },
};

export const Unavailable: Story = {
  args: { client: { overview: async () => { throw new Error('Нет соединения с сервером'); } } },
  play: async ({ canvas, args }) => {
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Нет соединения с сервером');
    await expect(canvas.queryByText('Собираем данные…')).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: /Данные и парсеры Обновления/ }));
    await expect(args.onNavigate).toHaveBeenCalledWith('standard-data');
  },
};

function RecoveryExample(args: AdminOverviewPageProps) {
  const [recoveryClient] = useState(() => {
    let failed = false;
    return { overview: async () => {
      if (!failed) { failed = true; throw new Error('Нет соединения с сервером'); }
      return overview;
    } };
  });
  return <AdminOverviewPage {...args} client={recoveryClient} />;
}

export const RecoverAfterError: Story = {
  render: args => <RecoveryExample {...args} />,
  play: async ({ canvas, args }) => {
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Нет соединения с сервером');
    await expect(canvas.queryByText('Собираем данные…')).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: /Пользователи Поиск/ }));
    await expect(args.onNavigate).toHaveBeenCalledWith('users');
    await userEvent.click(canvas.getByRole('button', { name: 'Повторить загрузку' }));
    await expect(await canvas.findByRole('button', { name: 'Платящие' })).toBeVisible();
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
  },
};
