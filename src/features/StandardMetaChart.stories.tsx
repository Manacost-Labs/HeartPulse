import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent } from 'storybook/test';
import StandardMetaChart from './StandardMetaChart';
import { StandardMetaChartSkeleton } from './StandardMetaChartSkeleton';
import './StandardMeta.css';

const meta = {
  title: 'Meta/Chart loading geometry', component: StandardMetaChart,
  args: { format: 'standard', formatLabel: 'Стандарт', rankLabel: 'Легенда',
    items: Array.from({ length: 12 }, (_, index) => ({ id: `meta-${index}`, slug: `meta-${index}`,
      archetype: `Archetype ${index}`, archetypeLabel: `Архетип ${index}`, classKey: 'mage',
      winrate: 49 + index / 2, popularity: index / 3, games: 1000, climbingSpeed: null })) },
  parameters: { layout: 'fullscreen', fullPage: true },
  decorators: [Story => <div style={{ maxWidth: 1092, marginInline: 'auto', paddingInline: 'clamp(.8rem, 2vw, 1.5rem)' }}><Story /></div>],
} satisfies Meta<typeof StandardMetaChart>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Collapsed: Story = {};
export const Expanded: Story = { play: async ({ canvas }) => { await userEvent.click(canvas.getByRole('button', { name: 'Показать' })); } };
export const Loading: Story = { render: args => <section className="standard-meta-chart"><div className="standard-meta-chart__content"><StandardMetaChartSkeleton formatLabel={args.formatLabel} rankLabel={args.rankLabel} count={args.items.length} /></div></section> };
