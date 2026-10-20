import type { ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import { Legendaries } from './DeferredRoutes';
import type { LegendariesData, LegendaryGroup } from '../modules/arenaLegendaries/public';

// Fixed values are story fixtures only; the production view requires API data.
const render = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="512" height="776"%3E%3Crect width="512" height="776" fill="%23745133"/%3E%3C/svg%3E';
const card = (cardId: string, name: string) => ({ cardId, name, imageRu: render, imageHa: render });
const group = (index: number, keyName: string, cardName: string): LegendaryGroup => ({
  keyCard: card(`key-${index}`, keyName),
  cards: [0, 1, 2].map(slot => card(`card-${index}-${slot}`, cardName)),
  winRate: 58.6 - index, pickRate: 21.4, offerRate: 33.2, score: 74, classKey: 'any',
});
// The longest real names: a two-line key card on narrow cards and three-line companions.
const long: LegendariesData = { updatedAt: '2026-10-19T07:00:00Z', source: 'hsreplay.net',
  groups: Array.from({ length: 6 }, (_, index) => group(index, 'Изера Неспящая, Аспект Сновидений', 'Повелительница Небесной выси')) };
const short: LegendariesData = { ...long,
  groups: Array.from({ length: 6 }, (_, index) => group(index, 'Рагнарос', 'Огонь')) };
const empty: LegendariesData = { groups: [], updatedAt: null, source: 'hsreplay.net' };

const meta = {
  title: 'Legendaries/Measured loading geometry', component: Legendaries,
  args: {
    data: long, loading: false, error: false, onRetry: fn(), legendarySource: 'hsreplay', onLegendarySourceChange: fn(),
    switchingLegendarySource: false, onNavigate: fn(), authUser: null, subscriptionStatus: null,
    subscriptionLoading: false, onRefreshSubscription: async () => null, accessGranted: true,
  } satisfies ComponentProps<typeof Legendaries>,
  parameters: { layout: 'fullscreen', fullPage: true },
  decorators: [Story => <div className="arena-app-shell arena-app-game-data arena-app-legendaries"
    style={{ maxWidth: 1180, marginInline: 'auto', paddingInline: 'clamp(.8rem, 2vw, 1.5rem)' }}><Story /></div>],
} satisfies Meta<typeof Legendaries>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('.legendary-group-card')).toHaveLength(6);
  },
};
export const ShortText: Story = { args: { data: short } };
export const Loading: Story = {
  args: { data: empty, loading: true },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Загружаем легендарные группы');
    await expect(canvas.getAllByRole('status')).toHaveLength(1);
    await expect(canvasElement.querySelectorAll('.legendary-group-card--loading')).toHaveLength(6);
    await expect(canvasElement.querySelector('.legendary-group-card--loading button, .legendary-group-card--loading a')).toBeNull();
    await expect(canvasElement.querySelector('.skeleton')).toBeNull();
    // The group count is data: it keeps its place without showing a number.
    await expect(canvas.getByText('0 групп')).not.toBeVisible();
  },
};
export const Empty: Story = {
  args: { data: empty },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Легендарных групп пока нет')).toBeVisible();
    await expect(canvas.queryByText(/npm run|scrape/)).not.toBeInTheDocument();
  },
};
export const Error: Story = {
  args: { data: empty, error: true },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent('Не удалось загрузить легендарные группы');
    await expect(canvas.queryByText('Легендарных групп пока нет')).not.toBeInTheDocument();
    await expect(canvas.queryByText(/scraper/)).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Повторить' }));
    await expect(args.onRetry).toHaveBeenCalledOnce();
  },
};
