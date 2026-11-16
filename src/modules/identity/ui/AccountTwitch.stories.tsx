import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import AccountTwitch from './AccountTwitch';
import './AccountDashboard.css';

// The Twitch block of the account before and after the streamer links a channel.

const meta = {
  title: 'Account/Twitch extension',
  component: AccountTwitch,
  args: { initial: { configured: true, linked: false, login: null, displayName: null } },
  decorators: [Story => <div className="account-dashboard" style={{ maxWidth: 760, margin: '0 auto', padding: 16 }}><Story /></div>],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof AccountTwitch>;
export default meta;
type Story = StoryObj<typeof meta>;

export const NotLinked: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: /Привязать Twitch/ })).toHaveAttribute('href', '/api/account/twitch/connect');
  },
};

export const Linked: Story = {
  args: { initial: { configured: true, linked: true, login: 'streamer', displayName: 'Streamer' } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Streamer')).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Отвязать' })).toBeEnabled();
  },
};
