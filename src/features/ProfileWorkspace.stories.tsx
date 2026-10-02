import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { lazy, Suspense } from 'react';
import { loadLoginPanel } from '../modules/identity/public';
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
        <div className="arena-content arena-content-open"><Suspense fallback="Загрузка профиля…"><Story /></Suspense></div>
      </div>
    </div>
  )],
} satisfies Meta<typeof LoginPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ActiveSubscription: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('heading', { name: 'Ваш доступ к HearthPulse' });
    await expect(canvas.getByRole('link', { name: /^Арена/ })).toHaveAttribute('href', '/tierlist/');
    const contacts = canvasElement.querySelector('details');
    if (!contacts) throw new Error('Contacts disclosure is missing');
    await expect(contacts).not.toHaveAttribute('open');
    await userEvent.click(canvas.getByText('Контакты для призов и рассылка'));
    await expect(contacts).toHaveAttribute('open');
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
    await canvas.findByRole('heading', { name: 'Ваш доступ к HearthPulse' });
    await userEvent.click(canvas.getByRole('button', { name: 'Проверить снова' }));
    // Messages float in document.body, outside the story canvas.
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByRole('alert')).toHaveTextContent('Не удалось проверить подписку');
  },
};
export const SaveContacts: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText('Контакты для призов и рассылка'));
    const contact = canvas.getByRole('textbox', { name: 'Почта для связи' });
    await userEvent.clear(contact);
    await userEvent.type(contact, 'contact@example.com');
    await userEvent.click(canvas.getByRole('button', { name: 'Сохранить' }));
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(() => expect(page.getByRole('status')).toHaveTextContent('Профиль обновлен.'));
    await expect(contact).toHaveValue('contact@example.com');
  },
};
