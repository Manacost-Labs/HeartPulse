import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import { ContestsPage } from './ContestsPage';
import type { Contest } from '../model/types';

const contest: Contest = { id: 'sizing-contest', title: 'Розыгрыш среди подписчиков',
  description: 'Подайте заявку и дождитесь результатов конкурса.', prize: 'Наборы карт', imageUrl: '',
  startsAt: '2026-10-19T12:00:00Z', endsAt: '2026-10-26T12:00:00Z', status: 'active', winners: [] };
const meta = {
  title: 'Contests/Measured loading geometry', component: ContestsPage,
  args: { authUser: null, subscriptionStatus: null, subscriptionLoading: false, onRefreshSubscription: fn(async () => null), initialContests: Array.from({ length: 3 }, (_, index) => ({ ...contest, id: `contest-${index}` })) },
  parameters: { layout: 'fullscreen', fullPage: true },
  decorators: [Story => <div className="arena-app-contests" style={{ maxWidth: 1092, marginInline: 'auto', paddingInline: 'clamp(.8rem, 2vw, 1.5rem)' }}><Story /></div>],
  beforeEach: () => {
    const original = window.fetch;
    window.fetch = (input, init) => String(input).startsWith('/api/contests') ? new Promise<Response>(() => {}) : original(input, init);
    return () => { window.fetch = original; };
  },
} satisfies Meta<typeof ContestsPage>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = { play: async ({ canvas }) => { await expect(canvas.getAllByRole('article')).toHaveLength(3); } };
export const Loading: Story = { args: { initialContests: undefined }, play: async ({ canvas }) => {
  await expect(canvas.getByRole('status')).toHaveTextContent('Загружаем конкурсы');
  await expect(canvas.queryByRole('article')).not.toBeInTheDocument();
} };
export const Completed: Story = { args: { initialContests: [{ ...contest, status: 'completed', winners: ['HP-001', 'HP-002'] }] } };
export const Empty: Story = { args: { initialContests: [] } };
