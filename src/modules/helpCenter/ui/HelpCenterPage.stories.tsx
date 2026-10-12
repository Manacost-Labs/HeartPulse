import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import HelpCenterPage from './HelpCenterPage';

const meta = {
  title: 'Help/Center', component: HelpCenterPage,
  parameters: { layout: 'fullscreen' },
  decorators: [Story => <div className="arena-app-shell arena-app-editorial bg-wood">
    <div className="arena-main"><div className="arena-content arena-content-open"><Story /></div></div>
  </div>],
} satisfies Meta<typeof HelpCenterPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AllQuestions: Story = {};
export const KeyboardSearch: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('searchbox'));
    await userEvent.tab();
    await userEvent.tab({ shift: true });
    await expect(canvas.getByRole('searchbox')).toHaveFocus();
  },
};
export const ClearSearch: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const search = canvas.getByRole('searchbox');
    await userEvent.type(search, 'код');
    await userEvent.click(canvas.getByRole('button', { name: 'Очистить поиск' }));
    await expect(search).toHaveValue('');
    await expect(search).toHaveFocus();
  },
};
export const SearchAnswers: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('searchbox'), 'бусти почту');
    await expect(canvas.getByText('Как подтвердить подписку Boosty?')).toBeVisible();
    await userEvent.click(canvas.getByText('Как подтвердить подписку Boosty?'));
    await expect(canvas.getByRole('link', { name: 'Подтвердить Boosty' })).toBeVisible();
    await expect(canvas.queryByText('Как выбрать класс для Арены?')).not.toBeInTheDocument();
  },
};
export const NoResults: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('searchbox'), 'неизвестныйвопрос123');
    await expect(canvas.getByRole('heading', { name: 'Пока нет совпадений' })).toBeVisible();
  },
};
export const TopicSelection: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const picker = canvas.queryByRole('combobox', { name: 'Тема вопросов' });
    if (picker) await userEvent.selectOptions(picker, 'battlegrounds');
    else await userEvent.click(canvas.getByRole('button', { name: /Герои и библиотека Полей/ }));
    await expect(canvas.getByText('Как выбрать героя на Полях сражений?')).toBeVisible();
    await expect(canvas.queryByText('Как зарегистрироваться?')).not.toBeInTheDocument();
  },
};
