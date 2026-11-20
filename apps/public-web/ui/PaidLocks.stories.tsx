import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import { PaidFilterLock, PaidMetricLock } from './PaidLocks';

const meta = {
  title: 'Access/PaidLocks',
  component: PaidMetricLock,
  args: { label: 'Винрейт против класса', onOpen: fn() },
} satisfies Meta<typeof PaidMetricLock>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A table cell: a lock with the figure's name, reachable by keyboard, opening the offer. */
export const Cell: Story = {
  play: async ({ canvas, args }) => {
    const lock = canvas.getByRole('button', { name: 'Винрейт против класса: по подписке. Узнать, как открыть' });
    await expect(lock).toHaveTextContent('По подписке');
    await userEvent.tab();
    await expect(lock).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await userEvent.click(lock);
    await expect(args.onOpen).toHaveBeenCalledTimes(2);
  },
};

export const Card: Story = { ...Cell, args: { variant: 'card', label: 'Игры' }, play: undefined };

export const Filter: StoryObj<typeof PaidFilterLock> = {
  render: args => <PaidFilterLock {...args} />,
  args: { label: 'Мана', value: 'Любая мана', onOpen: fn() },
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Мана (фильтр): по подписке. Узнать, как открыть' }));
    await expect(args.onOpen).toHaveBeenCalledTimes(1);
  },
};
