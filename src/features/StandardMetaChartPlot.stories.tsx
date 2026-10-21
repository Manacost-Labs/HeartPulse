import type { Meta, StoryObj } from '@storybook/react-vite';
import StandardMetaChartPlot from './StandardMetaChartPlot';
import { expect, userEvent, within } from 'storybook/test';

const classes = ['priest', 'shaman', 'warrior', 'demonhunter', 'warlock', 'mage', 'druid', 'hunter', 'paladin', 'rogue', 'deathknight'];
const points = Array.from({ length: 81 }, (_, index) => ({
  id: String(index), slug: `archetype-${index}`, archetype: `Archetype ${index + 1}`, archetypeLabel: `Архетип ${index + 1}`,
  classKey: classes[index % classes.length], winrate: 44 + ((index * 37) % 190) / 10,
  popularity: index < 6 ? 12 - index * 1.6 : ((index * 13) % 40) / 10, games: 300 + ((index * 977) % 9000), climbingSpeed: null,
}));
const meta = {
  title: 'Meta/Meta map', component: StandardMetaChartPlot,
  args: { points, format: 'standard', formatLabel: 'Стандарт', rankLabel: 'Алмаз — Легенда' },
  decorators: [Story => <div style={{ maxWidth: 1092, padding: 12, background: '#f7e5bc' }}><Story /></div>],
} satisfies Meta<typeof StandardMetaChartPlot>;
export default meta;
type Story = StoryObj<typeof meta>;
export const BubbleMap: Story = {};
export const PopularOnly: Story = { play: async ({ canvasElement }) => { const canvas = within(canvasElement); await userEvent.click(canvas.getByRole('checkbox')); await expect(canvas.getByText(/архетипов/)).toBeVisible(); } };
export const Shares: Story = { play: async ({ canvasElement }) => { const canvas = within(canvasElement); await userEvent.click(canvas.getByRole('radio', { name: 'Доли' })); await expect(canvas.getByRole('heading', { name: 'Доля игр' })).toBeVisible(); } };
export const GuestTopThree: Story = { args: { points: points.slice(0, 3) } };
