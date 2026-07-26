import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import { HeroSkinCard, type HeroSummary } from './Cosmetics';

const hero: HeroSummary = {
  cardId: 'HERO_11ai',
  dbf: 120228,
  name: { ru: 'Керриган-арахнид', en: 'Arachnid Kerrigan' },
  class: { slug: 'deathknight', nameRu: 'Рыцарь смерти' },
  rarity: { slug: 'mythic', nameRu: 'Мифический' },
  categorySlugs: ['mythic_skins', '2500_runestone_skins'],
  images: {
    static: 'https://db.kolodahs.ru/uploads/hero-skins/static/HERO_11ai.png',
    animated: 'https://hearthstone.wiki.gg/images/HERO_11ai.webm',
  },
};

const meta = {
  title: 'Cosmetics/HeroSkinCard',
  component: HeroSkinCard,
  decorators: [
    Story => (
      <div className="route-parchment-page cosmetics-page" style={{ width: 230, padding: 24 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    item: hero,
    navigatePath: fn(),
  },
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof HeroSkinCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Static: Story = {
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole('link', { name: /Керриган-арахнид/i }));
    await expect(args.navigatePath).toHaveBeenCalledWith('/cosmetics/heroes/HERO_11ai');
  },
};

export const NoHoverAnimation: Story = {
  play: async ({ canvas }) => {
    const card = canvas.getByRole('link', { name: /Керриган-арахнид/i });
    await userEvent.hover(card);
    await expect(canvas.queryByLabelText(/Анимация скина/i)).not.toBeInTheDocument();
  },
};

export const MissingMedia: Story = {
  args: {
    item: {
      ...hero,
      name: { ru: 'Неизвестный портрет', en: null },
      images: { static: null, animated: null },
    },
  },
};
