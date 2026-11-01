import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import type { AccountReplay } from '../api/replaysApi';
import AccountReplays from './AccountReplays';
import './AccountDashboard.css';

// The account's web replays (plan 2.2): the list with a delete that asks first, and the list that failed to load.

const replays: AccountReplay[] = [
  { id: 'abcDEF1234', kind: 'constructed', createdAt: '2026-11-01T00:00:00Z', mode: 'Ranked', result: 'Win', placement: 0 },
  { id: 'ghiJKL5678', kind: 'battlegrounds', createdAt: '2026-10-30T00:00:00Z', mode: 'Battlegrounds', result: 'Unknown', placement: 3 },
];

const meta = {
  title: 'Account/Replays',
  component: AccountReplays,
  args: { load: async () => replays, remove: fn(async () => {}), confirmDelete: fn(() => true) },
  decorators: [Story => <div className="account-dashboard" style={{ maxWidth: 760, margin: '0 auto', padding: 16 }}><Story /></div>],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof AccountReplays>;
export default meta;
type Story = StoryObj<typeof meta>;

export const List: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('Рейтинговая игра · Победа')).toBeVisible();
    await expect(canvas.getByText('Поля сражений, 3-е место')).toBeVisible();
  },
};

export const DeleteAsksFirst: Story = {
  args: { confirmDelete: fn(() => false) },
  play: async ({ args, canvas }) => {
    const buttons = await canvas.findAllByRole('button', { name: 'Удалить' });
    await userEvent.click(buttons[0]);
    await expect(args.confirmDelete).toHaveBeenCalled();
    await expect(args.remove).not.toHaveBeenCalled();
    await expect(canvas.getByText('Рейтинговая игра · Победа')).toBeVisible();
  },
};

export const LoadFailed: Story = {
  args: { load: async () => null },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Не удалось загрузить список реплеев');
    await expect(canvas.getByRole('button', { name: 'Повторить' })).toBeVisible();
  },
};

export const ListPhone: Story = { ...List, parameters: { viewport: { defaultViewport: 'mobile1' } } };
