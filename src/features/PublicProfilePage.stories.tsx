import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import { PublicProfileCard } from './PublicProfilePage';

const meta = {
  title: 'Profile/Public Profile',
  component: PublicProfileCard,
  args: {
    profile: {
      publicProfileId: 'p_AbCdEfGhIjKlMnOpQrStUv',
      name: 'Игрок Манакоста',
      avatarInitials: 'ИМ',
      createdAt: '2026-07-28T00:00:00.000Z',
    },
    onCopyLink: fn(),
  },
} satisfies Meta<typeof PublicProfileCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CopyPublicLink: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Скопировать публичную ссылку' }));
    await expect(args.onCopyLink).toHaveBeenCalledOnce();
    await expect(canvas.getByRole('button', { name: 'Ссылка скопирована' })).toBeVisible();
  },
};
