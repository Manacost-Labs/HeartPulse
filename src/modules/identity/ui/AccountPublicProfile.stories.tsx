import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import AccountPublicProfile from './AccountPublicProfile';
import './AccountDashboard.css';
import './AccountPlanSection.css';

const meta = {
  title: 'Identity/Account Public Profile',
  component: AccountPublicProfile,
  args: {
    identity: { publicProfileId: '7', nickname: null, nicknameChangeAvailableAt: null },
    failed: false,
    saving: false,
    saveNickname: fn(),
    origin: 'https://hearthpulse.net',
  },
  decorators: [Story => <div className="account-dashboard"><Story /></div>],
} satisfies Meta<typeof AccountPublicProfile>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A new account: only the short link, the nickname field is open. */
export const FirstNickname: Story = {
  play: async ({ args, canvas }) => {
    await expect(canvas.getByRole('link', { name: 'https://hearthpulse.net/id/7/' })).toBeVisible();
    await userEvent.type(canvas.getByLabelText('Ник'), 'Arena_Master');
    await userEvent.click(canvas.getByRole('button', { name: 'Сохранить ник' }));
    await expect(args.saveNickname).toHaveBeenCalledWith('Arena_Master');
  },
};

/** Right after a change: both links, and the field waits out the 30 days. */
export const RecentlyChanged: Story = {
  args: {
    identity: { publicProfileId: '7', nickname: 'Arena_Master', nicknameChangeAvailableAt: '2026-11-22T12:00:00.000Z' },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'https://hearthpulse.net/u/Arena_Master/' })).toBeVisible();
    await expect(canvas.getByLabelText('Ник')).toBeDisabled();
  },
};

export const Loading: Story = { args: { identity: null } };

export const Unavailable: Story = { args: { identity: null, failed: true } };
