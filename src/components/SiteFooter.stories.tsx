import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import SiteFooter from './SiteFooter';

const meta = {
  title: 'Navigation/Site Footer',
  component: SiteFooter,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof SiteFooter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LegalLinks: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('navigation', { name: 'Правовые документы' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Конфиденциальность' })).toHaveAttribute('href', '/privacy');
    await expect(canvas.getByRole('link', { name: 'Условия использования' })).toHaveAttribute('href', '/terms');
  },
};
