import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import FAQSection from './FAQSection';

const meta = {
  title: 'Shared/FAQ Section',
  component: FAQSection,
  parameters: {
    docs: {
      description: {
        component:
          'Общий аккордеон с ответами об Арене. Использует реальные тексты, стили и доступную связь между кнопкой и панелью.',
      },
    },
  },
} satisfies Meta<typeof FAQSection>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Collapsed: Story = {};

export const Expanded: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const firstQuestion = canvas.getByRole('button', {
      name: /Какой класс лучший на Арене Hearthstone/i,
    });

    await userEvent.click(firstQuestion);
    await expect(firstQuestion).toHaveAttribute('aria-expanded', 'true');
    await expect(
      canvas.getByText(/Актуальный рейтинг классов/i),
    ).toBeVisible();
  },
};
