import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import PublicProfileCard from './PublicProfileCard';

const meta = {
  title: 'Identity/Public Profile',
  component: PublicProfileCard,
  args: {
    profile: {
      publicProfileId: '7',
      nickname: 'Arena_Master',
      displayName: 'Arena_Master',
      avatarInitials: 'AR',
      memberSince: '2026-03',
      isSubscriber: true,
    },
    onCopyLink: fn(),
  },
} satisfies Meta<typeof PublicProfileCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Subscriber: Story = {};

/** Before the player picks a nickname: a neutral label, never the account name. */
export const WithoutNickname: Story = {
  args: {
    profile: { publicProfileId: '128', nickname: null, displayName: 'Игрок #128', avatarInitials: '#', memberSince: '2026-10', isSubscriber: false },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 1, name: 'Игрок #128' })).toBeVisible();
    await expect(canvas.queryByText('Подписчик')).toBeNull();
  },
};

export const CopyPublicLink: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Скопировать ссылку' }));
    await expect(args.onCopyLink).toHaveBeenCalledOnce();
    await expect(canvas.getByRole('button', { name: 'Ссылка скопирована' })).toBeVisible();
  },
};
