import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import '../../parchment-theme.css';
import { HeaderProfileButton } from './HeaderProfileButton';
const meta = {
  title: 'Navigation/Profile button', component: HeaderProfileButton,
  render: args => <>
    <div className="arena-sidebar" style={{ position: 'static', width: 280, height: 'auto', minHeight: 0 }}>
      <a href="/profile/" className="arena-sidebar-profile"><HeaderProfileButton {...args} /></a>
    </div>
    <div className="arena-mobile-menu" style={{ position: 'static' }}>
      <a href="/profile/" className="arena-mobile-menu-link arena-mobile-menu-profile"><HeaderProfileButton {...args} variant="mobile" /></a>
    </div>
  </>,
  args: { user: null, checking: false },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: /Профиль|Войти/ })).toBeVisible();
  },
} satisfies Meta<typeof HeaderProfileButton>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Guest: Story = {};
export const Checking: Story = { args: { checking: true } };
export const Account: Story = { args: { user: { email: 'fixture@example.test', name: 'Игрок', role: 'user' } } };
