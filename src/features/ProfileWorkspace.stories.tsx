import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { lazy, Suspense } from 'react';
import { AccountPlanCardSlot, loadLoginPanel } from '../modules/identity/public';
import AccountBillingPlanCard from './AccountBillingPlanCard';
const LoginPanel = lazy(loadLoginPanel);
import { mockProfileRequests, profileUser } from '../../tests/fixtures/profile-workspace-data';
import '../parchment-theme.css';

const meta = {
  title: 'Profile/Account workspace',
  component: LoginPanel,
  args: { initialAuthUser: profileUser },
  parameters: { layout: 'fullscreen' },
  beforeEach: () => mockProfileRequests(),
  decorators: [Story => (
    <div className="profile-story-shell arena-app-shell arena-app-profile bg-wood">
      <div className="arena-main">
        <div className="arena-content arena-content-open"><AccountPlanCardSlot.Provider value={AccountBillingPlanCard}><Suspense fallback="Загрузка профиля…"><Story /></Suspense></AccountPlanCardSlot.Provider></div>
      </div>
    </div>
  )],
} satisfies Meta<typeof LoginPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ActiveSubscription: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('heading', { name: 'Ваш план' });
    await expect(canvas.getByRole('heading', { level: 1, name: 'Александр' })).toBeVisible();
    await expect(canvas.getByText(/до 12 нояб\. 2099 г\., продлится автоматически/)).toBeVisible();
    await expect(await canvas.findByRole('link', { name: /^Арена/ })).toHaveAttribute('href', '/tierlist/');
    await expect(await canvas.findByRole('link', { name: 'Привязать' })).toHaveAttribute('href', expect.stringContaining('/api/auth/google/start'));
    await expect(canvas.getByRole('textbox', { name: 'Почта для связи' })).toBeVisible();
  },
};
export const NoSubscription: Story = {
  beforeEach: () => mockProfileRequests(false),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('heading', { name: 'Откройте полный доступ' });
    await expect(canvas.getByRole('textbox', { name: 'Почта, на которую оформлена подписка' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Прислать код' })).toBeEnabled();
  },
};
export const RefreshFailure: Story = {
  beforeEach: () => mockProfileRequests(true, true),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('heading', { name: 'Ваш план' });
    await userEvent.click(await canvas.findByRole('button', { name: 'Проверить снова' }));
    // Messages float in document.body, outside the story canvas.
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByRole('alert')).toHaveTextContent('Не удалось проверить подписку');
  },
};
export const SaveContacts: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const contact = await canvas.findByRole('textbox', { name: 'Почта для связи' });
    await userEvent.clear(contact);
    await userEvent.type(contact, 'contact@example.com');
    await userEvent.click(canvas.getByRole('button', { name: 'Сохранить' }));
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(() => expect(page.getByRole('status')).toHaveTextContent('Профиль обновлен.'));
    await expect(contact).toHaveValue('contact@example.com');
  },
};
