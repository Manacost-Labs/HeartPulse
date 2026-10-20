import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import LoginCard from './LoginCard';
import { LoginCardSkeleton } from './LoginCardSkeleton';
import '../../../shared/ui/LoadingSurface.css';
import './LoginPanel.css';
import './LoginCardSkeleton.css';

// The sign-in card and its skeleton in the same page frame as `/?login`
// (`.arena-content` padding of PublicPageShell), for the geometry test.
const meta = {
  title: 'Identity/Measured loading geometry',
  component: LoginCard,
  args: {
    mode: 'login',
    step: 'password',
    message: null,
    loading: false,
    values: { name: '', country: '', email: '', password: '', code: '', newsletter: false },
    countries: [],
    providers: null,
    onChange: fn(),
    onModeChange: fn(),
    onSubmit: fn(),
    onEditCredentials: fn(),
  },
  parameters: { layout: 'fullscreen', fullPage: true },
  decorators: [Story => <div className="arena-app-profile">
    <div className="arena-content w-full max-w-6xl mx-auto p-3 sm:p-6 md:p-10"><Story /></div>
  </div>],
} satisfies Meta<typeof LoginCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The guest sign-in card without social providers, as it first renders. */
export const Ready: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { name: 'Вход в HearthPulse' })).toBeVisible();
  },
};

export const Loading: Story = {
  render: () => <LoginCardSkeleton />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Загружаем вход');
    await expect(canvas.queryByRole('heading')).not.toBeInTheDocument();
  },
};
