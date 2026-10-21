import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { weeklyDeckRows } from '../modules/home/public';
import { WeeklyDecksBoard } from './WeeklyDecksLeaderboard';

const decks = [
  { slug: 'zee-c-thun-shaman', archetypeLabel: "К'тун Шаман", classKey: 'shaman', winrate: 63.6, games: 387 },
  { slug: 'c-thun-dh', archetypeLabel: "К'тун Охотник на демонов", classKey: 'demonhunter', winrate: 60.1, games: 1167 },
  { slug: 'dragon-pirate-warrior', archetypeLabel: 'Пиратский Воин на драконах', classKey: 'warrior', winrate: 59.7, games: 22987 },
];

const meta = {
  title: 'Home/Best decks leaderboard',
  component: WeeklyDecksBoard,
  args: {
    period: 'past_week',
    onPeriodChange: fn(),
    onRetry: fn(),
    state: { status: 'ready', rows: weeklyDeckRows(decks, [decks[1], decks[0], { ...decks[2], slug: 'zoolock' }]) },
  },
  decorators: [Story => <div style={{ maxWidth: 880, padding: 16 }}><Story /></div>],
} satisfies Meta<typeof WeeklyDecksBoard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WeekWithPlaceChanges: Story = {
  parameters: { docs: { description: { story: 'Public top three of the HSGuru meta: medals, class picture, win rate, games and the place against the wider window.' } } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole('listitem')).toHaveLength(3);
    await expect(canvas.getByText('2-е место за 2 недели', { exact: false })).toBeVisible();
    await userEvent.click(canvas.getByRole('radio', { name: 'Сутки' }));
    await expect(args.onPeriodChange).toHaveBeenCalledWith('past_day');
  },
};
export const WithoutComparison: Story = {
  args: { state: { status: 'ready', rows: weeklyDeckRows(decks, null) } },
};
export const Loading: Story = { args: { state: { status: 'loading' } } };
export const Unavailable: Story = {
  args: { state: { status: 'failed' } },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Повторить' }));
    await expect(args.onRetry).toHaveBeenCalled();
  },
};
export const NoDecks: Story = { args: { period: 'past_day', state: { status: 'ready', rows: [] } } };
