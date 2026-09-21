import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { LoginPanel } from './DeferredRoutes';
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
        <div className="arena-content arena-content-open"><Story /></div>
      </div>
    </div>
  )],
} satisfies Meta<typeof LoginPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ActiveSubscription: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('heading', { name: 'Доступ открыт' });
    const details = canvasElement.querySelector('details');
    if (!details) throw new Error('Access management disclosure is missing');
    await expect(details).not.toHaveAttribute('open');
    await userEvent.click(canvas.getByText('Настроить доступ'));
    await expect(details).toHaveAttribute('open');
    await expect(canvas.getByRole('textbox', { name: 'Почта подписки Boosty' })).toBeVisible();
  },
};
export const NoSubscription: Story = {
  beforeEach: () => mockProfileRequests(false),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole('heading', { name: 'Доступ не подтверждён' });
    await expect(canvasElement.querySelector('details')).toHaveAttribute('open');
  },
};
export const RefreshFailure: Story = {
  beforeEach: () => mockProfileRequests(true, true),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('heading', { name: 'Доступ открыт' });
    await userEvent.click(canvas.getByRole('button', { name: 'Проверить доступ' }));
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Не удалось проверить подписку');
  },
};
export const SaveContacts: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const contact = canvas.getByRole('textbox', { name: 'Почта для связи' });
    await userEvent.clear(contact);
    await userEvent.type(contact, 'contact@example.com');
    await userEvent.click(canvas.getByRole('button', { name: 'Сохранить профиль' }));
    await waitFor(() => expect(canvas.getByRole('status')).toHaveTextContent('Профиль обновлен.'));
    await expect(contact).toHaveValue('contact@example.com');
  },
};
