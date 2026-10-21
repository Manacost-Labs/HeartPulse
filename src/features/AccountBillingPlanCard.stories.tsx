import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import type { AccountPlanSummary } from '../modules/identity/public';
import AccountBillingPlanCard from './AccountBillingPlanCard';

const renewsAt = new Date(Date.now() + 22 * 86_400_000).toISOString();
const plan: AccountPlanSummary = {
  state: 'active',
  provider: 'boosty',
  title: 'Мастер арены',
  price: 300,
  renewsAt,
  renewal: 'auto',
  graceUntil: null,
  statusLine: 'Boosty · продлится автоматически',
};

const meta = {
  title: 'Features/Account Billing Plan Card',
  component: AccountBillingPlanCard,
  args: { plan, manageUrl: 'https://boosty.to/kolodahearthstone' },
  parameters: { layout: 'padded', backgrounds: { default: 'parchment' } },
} satisfies Meta<typeof AccountBillingPlanCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Renews: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Следующий платёж')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Управлять на Boosty' })).toBeVisible();
  },
};

export const WillNotRenew: Story = {
  args: { plan: { ...plan, renewal: 'ends' } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Доступ до')).toBeVisible();
    await expect(canvas.getByText('Не продлится')).toBeVisible();
  },
};

export const RenewalUnknown: Story = {
  args: { plan: { ...plan, renewal: 'unknown' } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Оплачено до')).toBeVisible();
  },
};
