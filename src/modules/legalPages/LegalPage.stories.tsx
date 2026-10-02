import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import LegalPage from './LegalPage';

const meta = {
  title: 'Public/Legal Documents',
  component: LegalPage,
  args: { kind: 'privacy' },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof LegalPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Privacy: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 1, name: 'Политика конфиденциальности' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Открыть документ' })).toHaveAttribute('href', '/terms/');
  },
};

export const Terms: Story = {
  args: { kind: 'terms' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 1, name: 'Условия использования' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Открыть документ' })).toHaveAttribute('href', '/privacy/');
  },
};
