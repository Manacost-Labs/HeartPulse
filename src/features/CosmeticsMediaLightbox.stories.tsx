import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { CosmeticsMediaLightbox } from './Cosmetics';

const meta = {
  title: 'Cosmetics/MediaLightbox',
  component: CosmeticsMediaLightbox,
  args: {
    media: {
      type: 'image',
      src: '/api/public-resource/db/uploads/hero-skins/static/HERO_11ai.png',
      title: 'Полный арт «Керриган-арахнид»',
    },
    onClose: fn(),
  },
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof CosmeticsMediaLightbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FullArt: Story = {
  play: async ({ canvasElement, args }) => {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole('dialog', { name: /Полный арт/i });
    await expect(dialog).toBeInTheDocument();
    await userEvent.click(page.getByRole('button', { name: 'Закрыть просмотр' }));
    await expect(args.onClose).toHaveBeenCalledOnce();
  },
};

export const Animation: Story = {
  args: {
    media: {
      type: 'video',
      src: 'https://hearthstone.wiki.gg/images/HERO_11aq.webm',
      poster: '/api/public-resource/db/uploads/hero-skins/static/HERO_11aq.png',
      title: 'Анимация скина «Вечный жнец Пустотел»',
      autoPlay: false,
    },
  },
};
