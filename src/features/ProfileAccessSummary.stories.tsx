import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import ProfileAccessSummary from './ProfileAccessSummary';
import './DeferredRoutes.css';

const meta = {
  title: 'Profile/Access summary',
  component: ProfileAccessSummary,
  args: { active: true, pending: false, checkedAt: '21.09.2026, 12:30', onRefresh: fn() },
  decorators: [
    Story => (
      <div className="arena-app-profile">
        <div className="profile-workspace">
          <section className="profile-subscription-panel"><Story /></section>
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof ProfileAccessSummary>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Active: Story = {
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Проверить доступ' }));
    await expect(args.onRefresh).toHaveBeenCalledOnce();
  },
};
export const Checking: Story = {
  args: { pending: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Проверяем...' })).toBeDisabled();
  },
};
export const Unconfirmed: Story = { args: { active: false } };
