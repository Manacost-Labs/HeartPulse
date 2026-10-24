import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import StandardMetaArchetypeTable from './StandardMetaArchetypeTable';
import { metaStoryItems, metaStoryTrends } from './standardMetaStoryFixtures';

const items = metaStoryItems(24);
const meta = {
  title: 'Meta/Archetype table', component: StandardMetaArchetypeTable,
  args: {
    items, rankById: new Map(items.map((item, index) => [item.id, index + 1])), format: 'standard', rank: 'diamond_legend',
    period: 'past_day', coin: 'any_player', minGames: 100, loadTrends: true, initialTrends: metaStoryTrends(items),
    formatLabel: 'Стандарт', rankLabel: 'Алмаз — Легенда', periodLabel: 'Сутки',
  },
  decorators: [Story => <div className="standard-meta" style={{ maxWidth: 1240, padding: 12, background: '#f3e2bd' }}><Story /></div>],
} satisfies Meta<typeof StandardMetaArchetypeTable>;
export default meta;
type Story = StoryObj<typeof meta>;
export const WithTrends: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const popularity = canvas.getByRole('button', { name: 'Сортировать по популярность' });
    await userEvent.click(popularity);
    await expect(popularity.closest('th')).toHaveAttribute('aria-sort', 'descending');
    await userEvent.click(popularity);
    await expect(popularity.closest('th')).toHaveAttribute('aria-sort', 'ascending');
    const [firstRow] = canvas.getAllByRole('row').slice(1);
    await expect(within(firstRow).getByRole('link')).toHaveAttribute('href', '/standard/archetypes/standard/archetype-23/');
  },
};
export const NoPreviousWindow: Story = {
  args: { period: 'past_30_days', periodLabel: '30 дней', initialTrends: { ...metaStoryTrends(items), comparison: null } },
};
export const GuestTopThree: Story = { args: { items: items.slice(0, 3), loadTrends: false, initialTrends: null } };
export const Phone: Story = { globals: { viewport: { value: 'mobile2', isRotated: false } }, parameters: { viewport: { defaultViewport: 'mobile2' } } };
