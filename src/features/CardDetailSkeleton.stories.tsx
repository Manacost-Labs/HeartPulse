import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, mocked } from 'storybook/test';
import StandardCardDetail from './StandardCardDetail';
import { loadConstructedCardDetail } from './constructedCardDetailPrefetch';
import type { PublicCardSeed } from '../modules/constructedCards/public';

// The real card page (a public visitor, statistics locked) and the same page
// before its first response. Names, facts and rules/flavor text vary: Ready
// (a two-line name on phones, ten facts, rules and flavor) and ShortText (a
// spell with eight facts and one rules line) bound the hero the paired
// browser test compares.
const minion: PublicCardSeed = {
  card_id: 'CORE_EX1_015', dbf: 69525, name: { ru: 'Новичок-инженер', en: 'Novice Engineer' },
  text: { ru: 'Боевой клич: вы берёте карту.' },
  flavor: { ru: 'Знания инженерного дела он почерпнул из книги «Сделай сам: механические курицы и другие опасные изобретения».' },
  class: 'NEUTRAL', card_set: 'CORE', card_type: { name_ru: 'Существо' }, rarity: 'COMMON', mana_cost: 2,
  attack: 1, health: 1, durability: null, armor: null, artist: 'Karen Luk',
  images: { card: '/arena-logo-icon.webp' }, stats: null,
};
const spell: PublicCardSeed = { ...minion, card_id: 'CORE_CS2_029', dbf: 69623, name: { ru: 'Огненный шар', en: 'Fireball' },
  text: { ru: 'Наносит 6 ед. урона.' }, flavor: { ru: null }, class: 'MAGE', card_type: { name_ru: 'Заклинание' },
  mana_cost: 4, attack: null, health: null };
const respond = (seed: PublicCardSeed) => () => {
  mocked(loadConstructedCardDetail).mockResolvedValue({ ok: true, status: 200, payload: { card: seed, statsAccess: false } });
};

const meta = {
  title: 'Card detail/Measured loading geometry', component: StandardCardDetail,
  args: { currentPath: `/standard/cards/standard/${minion.card_id}`, initialCard: minion, initialSearch: '',
    statsAccess: false, statsAccessLoading: false, authUser: null, navigatePath: fn(), onRefreshSubscription: fn(async () => null) },
  parameters: { layout: 'fullscreen', fullPage: true },
  decorators: [Story => <div style={{ paddingInline: 'clamp(.8rem, 2vw, 1.5rem)' }}><Story /></div>],
  beforeEach: respond(minion),
} satisfies Meta<typeof StandardCardDetail>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = { play: async ({ canvas }) => {
  await expect(canvas.getByRole('heading', { level: 1, name: minion.name.ru })).toBeVisible();
} };
export const ShortText: Story = { args: { currentPath: `/standard/cards/standard/${spell.card_id}`, initialCard: spell }, beforeEach: respond(spell) };
export const Loading: Story = {
  args: { initialCard: undefined },
  beforeEach: () => { mocked(loadConstructedCardDetail).mockReturnValue(new Promise(() => {})); },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Загружаем карту');
    await expect(canvas.queryByRole('heading')).not.toBeInTheDocument();
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
  },
};
