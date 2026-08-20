import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import {
  RelatedCardGallery,
  type RelatedCard,
} from './CosmeticsRelatedCardGallery';
import './Cosmetics.css';

const generatedCards: RelatedCard[] = [
  { cardId: 'TTN_002t20', dbf: 95222, name: { ru: 'Жадность', en: 'Driven to Greed' } },
  { cardId: 'BG31_BOBt2', dbf: 117725, name: { ru: 'Наем существа', en: 'Recruit a Minion' } },
  { cardId: 'CATA_200', dbf: 123060, name: { ru: 'Агент Древних', en: 'Agent of the Old Ones' } },
  { cardId: 'TOY_510', dbf: 103341, name: { ru: 'Поиск сокровищ', en: 'Dig for Treasure' } },
  { cardId: 'WW_415', dbf: 100942, name: { ru: 'Колодец желаний', en: 'Wishing Well' } },
  { cardId: 'JAIL_503', dbf: 125988, name: { ru: 'Кнут Черной Лапы', en: "Blackpaw's Whip" } },
];

const meta = {
  title: 'Cosmetics/RelatedCardGallery',
  component: RelatedCardGallery,
  decorators: [
    Story => (
      <div className="route-parchment-page cosmetics-page" style={{ minHeight: '100vh', padding: 32 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    title: 'Карты, которые генерируют монеты',
    items: generatedCards,
    imageOrigin: 'https://hearthpulse.net',
    navigatePath: fn(),
  },
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof RelatedCardGallery>;

export default meta;
type Story = StoryObj<typeof meta>;

export const GeneratedCards: Story = {
  play: async ({ canvas, args }) => {
    const firstCard = canvas.getByRole('link', { name: /Жадность/i });
    await expect(firstCard).toBeVisible();
    await userEvent.click(firstCard);
    await expect(args.navigatePath).toHaveBeenCalledWith('/standard/cards/wild/TTN_002t20');
  },
};

export const CardsRelatedToCoins: Story = {
  args: {
    title: 'Карты, которые связаны с монетами',
    items: generatedCards.slice(3),
  },
};
