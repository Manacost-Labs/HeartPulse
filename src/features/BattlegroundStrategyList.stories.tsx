import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { BattlegroundStrategyList } from './BattlegroundStrategyList';
import { strategyRows, type StrategyEntry } from './bgLibraryStrategyRows';
import real from '../../tests/fixtures/bg-strategies-130298-20261021.json';

// Builds of the 21.10.2026 comps snapshot that use Balinda Stonehearth (dbf 130298).
const rows = strategyRows(real.comps as StrategyEntry[], 130298,
  cardId => `/api/public-resource/db/uploads/art/${cardId}.jpg?width=96&quality=76&format=webp`)
  .map(row => ({ ...row, href: `/battlegrounds/tier-list/?strategy=${row.key}` }));

const meta = {
  title: 'Battlegrounds/Strategy list',
  component: BattlegroundStrategyList,
  args: { rows, onOpen: fn((_href: string, event: React.MouseEvent<HTMLAnchorElement>) => event.preventDefault()) },
  parameters: { layout: 'padded' },
  decorators: [Story => <div className="arena-app-battlegrounds" style={{ maxWidth: 1100 }}><Story /></div>],
} satisfies Meta<typeof BattlegroundStrategyList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Collapsed: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelectorAll('.bg-strategy-list__row')).toHaveLength(5);
    await userEvent.click(canvas.getByRole('button', { name: `Показать все (${rows.length})` }));
    await expect(canvasElement.querySelectorAll('.bg-strategy-list__row')).toHaveLength(rows.length);
    await userEvent.click(canvasElement.querySelector('.bg-strategy-list__row') as HTMLElement);
    await expect(args.onOpen).toHaveBeenCalled();
  },
};

export const Few: Story = {
  args: { rows: rows.slice(0, 3) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('button')).not.toBeInTheDocument();
  },
};

export const Phone: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
