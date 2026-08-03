import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';

import DeckRenderPreview from './DeckRenderPreview';

const meta = {
  title: 'Deckview/Deck Render Preview',
  component: DeckRenderPreview,
  decorators: [Story => (
    <div style={{ width: 'min(36rem, 100%)' }}>
      <Story />
    </div>
  )],
  args: {
    deckCode: '',
    deckName: 'Контроль Жрец',
    eager: true,
    children: <div>Резервный список карт</div>,
  },
  parameters: {
    docs: {
      description: {
        component: 'Общее Deckview-превью. Во время подготовки изображения резервирует квадратную область, а список карт показывает только после ошибки.',
      },
    },
  },
} satisfies Meta<typeof DeckRenderPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const LoadingWithoutListFlash: Story = {
  play: async ({ canvas, canvasElement }) => {
    const preview = canvasElement.querySelector('.deck-render-preview');
    await expect(preview).not.toBeNull();
    await expect(preview).toHaveAttribute('data-render-state', 'loading');
    await expect(preview).toHaveAttribute('aria-busy', 'true');
    await expect(canvas.queryByText('Резервный список карт')).not.toBeVisible();
  },
};
