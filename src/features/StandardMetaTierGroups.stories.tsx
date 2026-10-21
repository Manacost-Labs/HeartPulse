import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import StandardMetaTierGroups from './StandardMetaTierGroups';
import { metaStoryItems } from './standardMetaStoryFixtures';

const meta = {
  title: 'Meta/Tier groups', component: StandardMetaTierGroups,
  args: { items: metaStoryItems(40), format: 'standard', formatLabel: 'Стандарт', rankLabel: 'Алмаз — Легенда', periodLabel: 'Сутки', minGames: 100 },
  decorators: [Story => <div className="standard-meta" style={{ maxWidth: 1240, padding: 12, background: '#f3e2bd' }}><Story /></div>],
} satisfies Meta<typeof StandardMetaTierGroups>;
export default meta;
type Story = StoryObj<typeof meta>;
export const AllTiers: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole('heading', { level: 3 }).map(heading => heading.textContent)).toEqual(['Тир S', 'Тир A', 'Тир B', 'Тир C', 'Тир D']);
    await userEvent.click(canvas.getByText('Как считается тир'));
    await expect(canvas.getByText(/нижней границе 90% доверительного интервала/)).toBeVisible();
  },
};
export const EmptyTier: Story = { args: { items: metaStoryItems(40).filter(item => (item.winrate ?? 0) < 51 || (item.winrate ?? 0) > 54) } };
export const GuestTopThree: Story = { args: { items: metaStoryItems(3) } };
