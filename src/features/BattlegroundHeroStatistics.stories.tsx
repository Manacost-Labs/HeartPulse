import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';
import { BattlegroundHeroStatistics } from './BattlegroundHeroStatistics';

const meta = {
  title: 'Battlegrounds/Hero statistics',
  component: BattlegroundHeroStatistics,
  args: {
    overview: <p>Среднее место 4,2 · 120 игр</p>,
    power: <p>Ход 5 · применение силы героя 72%</p>,
    tavern: <p>Улучшение таверны на ходу 3 · 64%</p>,
    compositions: <p>Драконы · среднее место 4,1</p>,
  },
} satisfies Meta<typeof BattlegroundHeroStatistics>;
export default meta;
type Story = StoryObj<typeof meta>;

export const KeyboardNavigation: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('tabpanel')).toHaveLength(1);
    await userEvent.click(canvas.getByRole('tab', { name: 'Обзор' }));
    await userEvent.keyboard('{ArrowRight}');
    await expect(canvas.getByRole('tab', { name: 'Сила героя' })).toHaveFocus();
    await expect(canvas.getByText(/Ход 5/)).toBeVisible();
    await expect(canvas.getByText(/Среднее место 4,2/)).not.toBeVisible();
    await userEvent.keyboard('{End}');
    await expect(canvas.getByText(/Драконы/)).toBeVisible();
    await userEvent.keyboard('{Home}');
    await expect(canvas.getByRole('tab', { name: 'Обзор' })).toHaveAttribute('aria-selected', 'true');
  },
};

export const EmptySection: Story = { args: { overview: null } };
