import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import { ArenaClassesBoard } from './ArenaClassesBoard';
import type { ArenaClassesData } from '../model/state';

// Fixed values are story fixtures only; the production view requires API data.
const data: ArenaClassesData = {
  classes: [
    { id: 'mage', name: 'Маг', winrate: 51.2, color: '#2b5c85', games: 12450 },
    { id: 'dk', name: 'Рыцарь смерти', winrate: 50.4, color: '#1f252d', games: 8432 },
  ],
  updatedAt: '2026-09-22T12:00:00Z', source: 'hsreplay',
};
const meta = {
  title: 'Arena/Classes Data', component: ArenaClassesBoard,
  args: { state: { status: 'ready', data }, onRetry: fn() },
  decorators: [Story => <div className="arena-app-winrates"><div className="arena-classes-page"><Story /></div></div>],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ArenaClassesBoard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole('list', { name: 'Рейтинг классов' })).toBeVisible();
    await expect(canvas.getByText('51.2%')).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Повторить загрузку' })).not.toBeInTheDocument();
    await expect(args.onRetry).not.toHaveBeenCalled();
  },
};
export const Loading: Story = {
  args: { state: { status: 'loading', data: null } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Загрузка статистики');
    await expect(canvas.queryByRole('list')).not.toBeInTheDocument();
  },
};
export const Empty: Story = {
  args: { state: { status: 'empty', data: { ...data, classes: [] } } },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('пока нет');
    await userEvent.click(canvas.getByRole('button', { name: 'Повторить загрузку' }));
    await expect(args.onRetry).toHaveBeenCalledOnce();
  },
};
export const Error: Story = {
  args: { state: { status: 'error', data: null } },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent('Не удалось загрузить');
    await expect(canvas.queryByRole('list')).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Повторить загрузку' }));
    await expect(args.onRetry).toHaveBeenCalledOnce();
  },
};
export const Stale: Story = {
  args: { state: { status: 'stale', data } },
  play: async ({ canvas, args }) => {
    await expect(canvas.queryByRole('status')).not.toBeInTheDocument();
    await expect(canvas.getByText('51.2%')).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Повторить загрузку' })).not.toBeInTheDocument();
    await expect(args.onRetry).not.toHaveBeenCalled();
  },
};

export const DownloadableChart: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByText('График классов и скачивание'));
    await expect(canvas.getByRole('img', { name: 'Винрейт классов Арены' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Скачать Винрейт классов Арены: SVG' })).toBeEnabled();
    await expect(canvas.getByText('51,2%')).toBeVisible();
  },
};

export const ZeroWinrate: Story = {
  args: { state: { status: 'ready', data: { ...data, classes: [{ ...data.classes[0], winrate: 0, games: 0 }] } } },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText('0.0%')).toBeVisible();
    await expect(canvasElement.querySelector('.arena-class-meter-fill')?.getBoundingClientRect().width).toBe(0);
    await userEvent.click(canvas.getByText('График классов и скачивание'));
    await expect(canvas.getAllByText('0%').length).toBeGreaterThan(0);
  },
};
