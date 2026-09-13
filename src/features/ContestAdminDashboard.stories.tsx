import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import { ContestAdminDashboard } from './ContestAdminDashboard';
import './contests.css';
import '../modules/adminWorkspace/adminWorkspace.css';

const meta = {
  title: 'Admin/Overview',
  component: ContestAdminDashboard,
  decorators: [Story => (
    <main className="admin-workspace-page admin-tailadmin-shell" style={{ minHeight: '100vh', padding: 24 }}>
      <Story />
    </main>
  )],
  parameters: { layout: 'fullscreen' },
  args: {
    articleCount: 184,
    galleryCount: 42,
    boostyPaidCount: 321,
    telegramAccessCount: 288,
    contestCount: 6,
    contestEntryCount: 1284,
    referralCount: 23,
    referralClickCount: 8905,
    recentReferralClicks: [
      { id: 'click-1', referralId: 'ref-1', slug: 'patch-notes', clickedAt: '2026-09-13T15:42:00Z', userAgent: '', referrer: '', landingPath: '/' },
      { id: 'click-2', referralId: 'ref-2', slug: 'arena-guide', clickedAt: '2026-09-13T15:11:00Z', userAgent: '', referrer: '', landingPath: '/arena' },
      { id: 'click-3', referralId: 'ref-3', slug: 'boosty', clickedAt: '2026-09-13T14:48:00Z', userAgent: '', referrer: '', landingPath: '/articles' },
    ],
    formatDate: value => new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)),
    onNavigate: fn(),
    onCreateContest: fn(),
  },
} satisfies Meta<typeof ContestAdminDashboard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OperationalOverview: Story = {
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Данные и парсеры' }));
    await expect(args.onNavigate).toHaveBeenCalledWith('standard-data');
    await userEvent.click(canvas.getByRole('button', { name: 'Создать конкурс' }));
    await expect(args.onCreateContest).toHaveBeenCalledOnce();
    await expect(canvas.getAllByRole('button')).toHaveLength(11);
    await userEvent.click(canvas.getByRole('button', { name: 'Открыть Boosty' }));
    await expect(args.onNavigate).toHaveBeenCalledWith('boosty');
    await userEvent.click(canvas.getByRole('button', { name: 'Открыть Telegram' }));
    await expect(args.onNavigate).toHaveBeenCalledWith('telegram');
  },
};

export const WithoutReferralActivity: Story = {
  args: { recentReferralClicks: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Переходов пока нет');
  },
};
