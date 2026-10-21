import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import PaywallPending from './PaywallPending';
import '../shared/ui/LoadingSurface.css';

const meta = {
  title: 'Access/PaywallPending',
  component: PaywallPending,
  args: { children: 'Проверяем доступ к матчапам…' },
  parameters: { layout: 'fullscreen' },
  decorators: [Story => <div className="arena-app-game-data" style={{ maxWidth: 1134, margin: '0 auto', padding: 16 }}><Story /></div>],
} satisfies Meta<typeof PaywallPending>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The access check: the gate's empty plate in its place; the status is for screen readers. */
export const Plate: Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Проверяем доступ к матчапам…');
    await expect(canvasElement.querySelector('.arena-paywall-pending p')).toHaveClass('sr-only');
    await expect(canvasElement.querySelector('.arena-paywall-pending__plate')).not.toBeNull();
  },
};

export const Phone: Story = { ...Plate, parameters: { viewport: { defaultViewport: 'mobile1' } } };

/** A paid view's own chunk load keeps the plain caption. */
export const Caption: Story = {
  args: { children: 'Загружаем раздел…', plate: false },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.arena-paywall-pending__plate')).toBeNull();
  },
};
