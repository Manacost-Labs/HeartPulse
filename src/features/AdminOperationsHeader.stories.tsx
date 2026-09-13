import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import { AdminOperationsHeader } from './AdminOperationsHeader';
import './contests.css';
import '../modules/adminWorkspace/adminWorkspace.css';

const onRefresh = fn();

const meta = {
  title: 'Admin/Operations Header',
  component: AdminOperationsHeader,
  decorators: [Story => (
    <main className="admin-workspace-page admin-tailadmin-shell" style={{ minHeight: '100vh', padding: 24 }}>
      <Story />
    </main>
  )],
  parameters: { layout: 'fullscreen' },
  args: {
    eyebrow: 'Аудитория',
    title: 'Пользователи',
    description: 'Поиск профилей, управление доступом и блокировками в одном списке.',
    status: 'База готова к работе',
    statusTone: 'ready',
    metrics: [
      { label: 'Всего профилей', value: 2_418, detail: 'в единой базе' },
      { label: 'На странице', value: 25, detail: 'страница 1 из 97' },
      { label: 'С доступом', value: 18, detail: 'на этой странице' },
      { label: 'Заблокированы', value: 0, detail: 'на этой странице' },
    ],
    actions: <button type="button" className="contest-secondary-button" onClick={onRefresh}>Обновить</button>,
  },
} satisfies Meta<typeof AdminOperationsHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('База готова к работе');
    await userEvent.click(canvas.getByRole('button', { name: 'Обновить' }));
    await expect(onRefresh).toHaveBeenCalledOnce();
  },
};

export const Working: Story = {
  args: {
    status: 'Обновляем данные',
    statusTone: 'working',
    actions: <button type="button" className="contest-secondary-button" disabled>Загрузка…</button>,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Обновляем данные');
    await expect(canvas.getByRole('button', { name: 'Загрузка…' })).toBeDisabled();
  },
};

export const Attention: Story = {
  args: {
    status: '3 требуют внимания',
    statusTone: 'attention',
    metrics: [
      { label: 'Найдено', value: 3, detail: 'по текущему фильтру' },
      { label: 'На странице', value: 3, detail: 'по текущему фильтру' },
      { label: 'С доступом', value: 1, detail: 'на этой странице' },
      { label: 'Заблокированы', value: 3, detail: 'на этой странице' },
    ],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('3 требуют внимания');
    await expect(canvas.getByText('Найдено')).toBeVisible();
  },
};
