import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import { CosmeticsGridSkeleton } from './CosmeticsGridSkeleton';
import { HeroSkinCard, type HeroSummary } from './Cosmetics';

const hero: HeroSummary = {
  cardId: 'HERO_11ai', dbf: 120228, name: { ru: 'Легендарный портрет Керриган-арахнид из нового сезона', en: null },
  class: { slug: 'deathknight', nameRu: 'Рыцарь смерти' }, rarity: { slug: 'mythic', nameRu: 'Мифический' },
  categorySlugs: [], images: { static: null, animated: null },
};
const meta = {
  title: 'Cosmetics/Measured loading geometry', component: CosmeticsGridSkeleton,
  parameters: { layout: 'fullscreen', fullPage: true },
  decorators: [Story => <div className="route-parchment-page cosmetics-page" style={{ maxWidth: 1092, marginInline: 'auto', paddingInline: 'clamp(.8rem, 2vw, 1.5rem)' }}><section className="cosmetics-surface"><Story /></section></div>],
} satisfies Meta<typeof CosmeticsGridSkeleton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Загружаем косметику');
    await expect(canvas.queryByRole('link')).not.toBeInTheDocument();
  },
};
export const Ready: Story = {
  render: () => <div className="cosmetics-grid">{Array.from({ length: 12 }, (_, index) =>
    <HeroSkinCard key={index} item={{ ...hero, cardId: `HERO_${index}` }} navigatePath={fn()} />)}</div>,
  play: async ({ canvas }) => { await expect(canvas.getAllByRole('link')).toHaveLength(12); },
};
export const ShortNames: Story = { ...Ready, render: () => <div className="cosmetics-grid">{Array.from({ length: 12 }, (_, index) =>
  <HeroSkinCard key={index} item={{ ...hero, cardId: `HERO_${index}`, name: { ru: 'Маг', en: null } }} navigatePath={fn()} />)}</div> };
