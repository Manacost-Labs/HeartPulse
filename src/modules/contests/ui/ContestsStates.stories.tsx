import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor } from 'storybook/test';
import { ContestsPage } from './ContestsPage';
import type { Contest } from '../model/types';

/**
 * Loading states besides the measured first load: a signed-in viewer's own
 * entries load behind the server list, which stays visible (dimmed,
 * aria-busy); a failed request offers a retry. `Network` sends the real
 * request (a browser test holds it to prove the deadline ends in the error).
 */
type Mode = 'hold' | 'fail' | 'network';
const contest: Contest = { id: 'state-contest', title: 'Розыгрыш среди подписчиков',
  description: 'Подайте заявку и дождитесь результатов конкурса.', prize: 'Наборы карт', imageUrl: '',
  startsAt: '2026-10-19T12:00:00Z', endsAt: '2026-10-26T12:00:00Z', status: 'active', winners: [] };
const contests = Array.from({ length: 3 }, (_, index) => ({ ...contest, id: `contest-${index}` }));

const meta = {
  title: 'Contests/Loading states', component: ContestsPage,
  args: { authUser: null, subscriptionStatus: null, subscriptionLoading: false, onRefreshSubscription: fn(async () => null), initialContests: undefined },
  parameters: { layout: 'fullscreen', fullPage: true, mode: 'hold' satisfies Mode },
  decorators: [Story => <div className="arena-app-contests" style={{ maxWidth: 1092, marginInline: 'auto', paddingInline: 'clamp(.8rem, 2vw, 1.5rem)' }}><Story /></div>],
  beforeEach: ({ parameters }) => {
    const original = window.fetch;
    const mode = parameters.mode as Mode;
    window.fetch = (input, init) => {
      if (!String(input).startsWith('/api/contests') || mode === 'network') return original(input, init);
      if (mode === 'fail') return Promise.resolve(new Response('{"error":"Сервис конкурсов недоступен"}', { status: 503 }));
      return new Promise<Response>(() => {});
    };
    return () => { window.fetch = original; };
  },
} satisfies Meta<typeof ContestsPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PersonalRefresh: Story = {
  args: { authUser: { id: 'viewer', email: 'viewer@example.com', name: 'Зритель', role: 'user' }, initialContests: contests },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getAllByRole('article')).toHaveLength(3);
    const grid = canvasElement.querySelector('.contest-grid');
    await waitFor(() => expect(grid).toHaveAttribute('aria-busy', 'true'));
    await expect(grid).toHaveClass('data-surface');
    await expect(canvas.queryByRole('status')).not.toBeInTheDocument();
  },
};

export const LoadError: Story = {
  parameters: { mode: 'fail' },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Сервис конкурсов недоступен');
    await expect(canvas.getByRole('button', { name: 'Повторить' })).toBeEnabled();
    await expect(canvas.queryByText('Сейчас активных конкурсов нет')).not.toBeInTheDocument();
  },
};

export const RefreshError: Story = {
  args: { authUser: { id: 'viewer', email: 'viewer@example.com', name: 'Зритель', role: 'user' }, initialContests: contests },
  parameters: { mode: 'fail' },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Не удалось обновить конкурсы');
    await expect(canvas.getAllByRole('article')).toHaveLength(3);
  },
};

export const Network: Story = { parameters: { mode: 'network' } };
