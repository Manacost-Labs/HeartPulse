import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { LoginCardSkeleton } from './LoginCardSkeleton';
import '../../../shared/ui/LoadingSurface.css';
import './LoginCardSkeleton.css';

const meta = {
  title: 'Identity/Login card skeleton',
  component: LoginCardSkeleton,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof LoginCardSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** `/?login` while the account code loads: one status, no heading, link or control. */
export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Загружаем вход');
    await expect(canvas.queryByRole('heading')).not.toBeInTheDocument();
    await expect(canvas.queryByRole('link')).not.toBeInTheDocument();
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
    await expect(canvas.getByRole('status').closest('[aria-busy="true"]')).toBeNull();
  },
};
