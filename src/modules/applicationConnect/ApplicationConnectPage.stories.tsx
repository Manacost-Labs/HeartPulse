import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import { ApplicationConnectView } from './ApplicationConnectView';

const authorization = {
  clientId: 'manacost-tracker',
  clientName: 'Manacost Tracker',
  scopes: [
    'profile.read',
    'subscription.read',
    'catalog.read',
    'images.read',
    'statistics.read',
  ],
  expiresAt: Date.UTC(2026, 6, 29, 18, 30),
};

const meta = {
  title: 'Developer/Application connection',
  component: ApplicationConnectView,
  args: {
    state: 'review',
    userCode: 'ABCD-2345',
    user: { id: 'user-1', name: 'Игрок Манакоста', email: 'player@example.com', role: 'user' },
    authorization,
    errorMessage: '',
    onCodeChange: fn(),
    onInspect: fn(),
    onApprove: fn(),
    onDeny: fn(),
  },
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div style={{ minHeight: '100vh', padding: 'clamp(12px, 4vw, 48px)', background: '#e8cf96' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ApplicationConnectView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Review: Story = {
  play: async ({ args, canvas }) => {
    await expect(canvas.getByText('Manacost Tracker')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Разрешить подключение' }));
    await expect(args.onApprove).toHaveBeenCalledOnce();
  },
};

export const InvalidCode: Story = {
  args: {
    state: 'error',
    authorization: null,
    errorMessage: 'Код не найден, уже использован или истёк.',
  },
};

export const Approved: Story = {
  args: { state: 'approved', authorization: null },
};

export const Denied: Story = {
  args: { state: 'denied', authorization: null },
};
