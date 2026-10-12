import type { Meta, StoryObj } from '@storybook/react-vite';
import StandardMetaChartPlot from './StandardMetaChartPlot';
import { expect, userEvent, within } from 'storybook/test';

const points = Array.from({ length: 95 }, (_, index) => ({ id: String(index), slug: `archetype-${index}`, archetype: `Archetype ${index + 1}`, archetypeLabel: `Архетип ${index + 1}`, classKey: 'mage', winrate: 32 + index * 0.28, popularity: index > 80 ? (index - 80) * 0.74 : index % 8 * 0.02, games: 1000 + index * 100, climbingSpeed: null }));
const meta = { title: 'Meta/Scatter Analytics', component: StandardMetaChartPlot, args: { points, popularPoints: [...points].sort((a, b) => b.popularity - a.popularity), format: 'standard', formatLabel: 'Стандарт', rankLabel: 'Алмаз — Легенда' } } satisfies Meta<typeof StandardMetaChartPlot>;
export default meta;
type Story = StoryObj<typeof meta>;
export const DenseMeta: Story = {};
export const PopularOnly: Story = { play: async ({ canvasElement }) => { const canvas = within(canvasElement); await userEvent.click(canvas.getByRole('checkbox')); await expect(canvas.getByText(/14 архетипов/)).toBeVisible(); } };
