import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import type { AccountPlanSummary } from '../model/accountPlan';
import AccountPlanSection from './AccountPlanSection';
import './AccountDashboard.css';

// The plan section while the subscription is checked and once it is known:
// the placeholder holds the active plan's plate and tiles, so the answer does
// not push the rest of the account down.

const pending: AccountPlanSummary = {
  state: 'pending', provider: null, title: '', price: null, renewsAt: null, renewal: 'unknown', graceUntil: null, statusLine: '',
};
const active: AccountPlanSummary = {
  state: 'active', provider: 'manual', title: 'Доступ от администрации', price: null, renewsAt: null, renewal: 'unknown',
  graceUntil: null, statusLine: 'Бессрочный доступ выдан администратором.',
};
const boosty = { email: '', code: '', step: 'email' as const, busy: false, onEmailChange: fn(), onCodeChange: fn(), onSubmit: fn() };

const meta = {
  title: 'Account/Plan section',
  component: AccountPlanSection,
  args: { plan: pending, subscription: null, loading: true, checkedAt: '', onRefresh: fn(), boosty, patreonLinkUrl: '' },
  decorators: [Story => <div className="account-dashboard" style={{ maxWidth: 760, margin: '0 auto', padding: 16 }}><Story /></div>],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof AccountPlanSection>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Checking: Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Проверяем подписку');
    await expect(canvasElement.querySelectorAll('.account-plan__loading .account-access__tile').length).toBeGreaterThan(0);
  },
};

export const Active: Story = {
  args: {
    plan: active,
    loading: false,
    subscription: { hasAccess: true, source: 'manual', checkedAt: new Date().toISOString(), stale: false, message: '', entitlements: { standard: true }, boosty: {}, patreon: {}, telegram: {} },
  },
};

export const CheckingPhone: Story = { ...Checking, parameters: { viewport: { defaultViewport: 'mobile1' } } };
