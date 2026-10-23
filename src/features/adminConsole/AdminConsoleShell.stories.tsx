import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { AdminConsoleShell } from './AdminConsoleShell';
import { ADMIN_NAV_ITEMS, CONTEST_ADMIN_NAV_ITEMS } from './adminNavigation';

function SectionPreview() {
  return (
    <div className="admin-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
      <div><dl><dt>С доступом сейчас</dt><dd><strong>1 284</strong><small>платят 1 243 · вручную 41</small></dd></dl></div>
      <div><dl><dt>Новые пользователи</dt><dd><strong>537</strong><small>за 30 дней</small></dd></dl></div>
      <div><dl><dt>Истекает за 7 дней</dt><dd><strong>14</strong><small>ручной доступ</small></dd></dl></div>
    </div>
  );
}

const meta = {
  title: 'Admin/Console Shell',
  component: AdminConsoleShell,
  args: {
    navigation: ADMIN_NAV_ITEMS,
    activeSection: 'dashboard',
    accessLabel: 'Полный доступ',
    userLabel: 'QA Administrator',
    userTitle: 'qa@example.com',
    message: null,
    onNavigate: fn(),
    onIntent: fn(),
    onDismissMessage: fn(),
    children: <SectionPreview />,
  },
  beforeEach: () => {
    // The rail choice is remembered per browser; every story starts with the full sidebar.
    try { window.localStorage.removeItem('hp-admin-sidebar-collapsed'); } catch { /* storage blocked */ }
  },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof AdminConsoleShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FullAccess: Story = {
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole('heading', { level: 1, name: 'Обзор' })).toBeVisible();
    const people = canvas.getByRole('button', { name: 'Пользователи' });
    await userEvent.hover(people);
    await expect(args.onIntent).toHaveBeenCalledWith('users');
    await userEvent.click(people);
    await expect(args.onNavigate).toHaveBeenCalledWith('users');
  },
};

export const SectionSearch: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /Найти раздел/ }));
    const search = await within(canvasElement.ownerDocument.body).findByRole('combobox');
    await userEvent.type(search, 'буст');
    await userEvent.keyboard('{Enter}');
    await expect(args.onNavigate).toHaveBeenCalledWith('boosty');
  },
};

export const CollapsedRail: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Свернуть меню' }));
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Развернуть меню' })).toBeVisible());
    // Group headings turn into dividers; the path in the top bar still names the group.
    const menu = canvas.getByRole('navigation', { name: 'Разделы админ панели' });
    await expect(within(menu).queryByText('Рабочий стол')).not.toBeInTheDocument();
  },
};

export const MobileDrawer: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Открыть меню' }));
    const drawer = await canvas.findByRole('dialog', { name: 'Разделы админ панели' });
    await userEvent.click(within(drawer).getByRole('button', { name: 'Статьи' }));
    await expect(args.onNavigate).toHaveBeenCalledWith('articles');
    await waitFor(() => expect(canvas.queryByRole('dialog', { name: 'Разделы админ панели' })).not.toBeInTheDocument());
  },
};

export const ContestOnly: Story = {
  args: {
    navigation: CONTEST_ADMIN_NAV_ITEMS,
    activeSection: 'contests',
    accessLabel: 'Управление конкурсами',
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 1, name: 'Конкурсы' })).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Пользователи' })).not.toBeInTheDocument();
  },
};

export const SuccessToast: Story = {
  args: { message: { type: 'ok', text: 'Изменения сохранены.' } },
  play: async ({ canvasElement, args }) => {
    const toast = within(canvasElement).getByRole('status');
    await expect(toast).toHaveTextContent('Изменения сохранены.');
    await userEvent.click(within(toast).getByRole('button', { name: 'Закрыть уведомление' }));
    await expect(args.onDismissMessage).toHaveBeenCalledOnce();
  },
};

export const ErrorToast: Story = {
  args: { message: { type: 'err', text: 'Не удалось сохранить изменения.' } },
  play: async ({ canvas, args }) => {
    await userEvent.click(within(canvas.getByRole('alert')).getByRole('button', { name: 'Закрыть уведомление' }));
    await expect(args.onDismissMessage).toHaveBeenCalledOnce();
  },
};
