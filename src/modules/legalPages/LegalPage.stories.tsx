import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import LegalPage from './LegalPage';

const meta = {
  title: 'Public/Legal Documents',
  component: LegalPage,
  args: { kind: 'privacy', navigatePath: fn() },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof LegalPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Privacy: Story = {
  play: async ({ args, canvas }) => {
    await expect(canvas.getByRole('heading', { level: 1, name: 'Политика конфиденциальности' })).toBeVisible();
    await userEvent.click(canvas.getByRole('link', { name: 'Открыть документ' }));
    await expect(args.navigatePath).toHaveBeenCalledWith('/terms');
  },
};

export const Terms: Story = {
  args: { kind: 'terms' },
  play: async ({ args, canvas }) => {
    await expect(canvas.getByRole('heading', { level: 1, name: 'Условия использования' })).toBeVisible();
    await userEvent.click(canvas.getByRole('link', { name: 'Открыть документ' }));
    await expect(args.navigatePath).toHaveBeenCalledWith('/privacy');
  },
};
