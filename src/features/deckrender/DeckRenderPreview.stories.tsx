import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

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

const PREVIEW_DATA_URL = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="720" height="720"%3E%3Crect width="720" height="720" fill="%23ead3a0"/%3E%3C/svg%3E';
const FULL_DATA_URL = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="2048" height="2048"%3E%3Crect width="2048" height="2048" fill="%235b351b"/%3E%3C/svg%3E';

export const PreviewCardWithFullSizeViewer: Story = {
  args: {
    deckCode: 'AAEC-story-preview-1234567890',
    initialAsset: {
      imageUrl: FULL_DATA_URL,
      previewImageUrl: PREVIEW_DATA_URL,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const preview = canvasElement.querySelector<HTMLImageElement>('.deck-render-preview__image img');
    await expect(preview).not.toBeNull();
    await expect(preview).toHaveAttribute('src', PREVIEW_DATA_URL);
    preview?.dispatchEvent(new Event('load'));
    const open = await canvas.findByRole('button', { name: /открыть колоду/i });
    await userEvent.click(open);
    const lightbox = document.body.querySelector<HTMLImageElement>('.deck-render-lightbox__image');
    await expect(lightbox).not.toBeNull();
    await expect(lightbox).toHaveAttribute('src', FULL_DATA_URL);
  },
};
