import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, mocked } from 'storybook/test';
import StandardCards from './StandardCards';
import { loadConstructedCardList, prefetchConstructedCardList } from './constructedCardListPrefetch';
import type { PublicCardCatalogSeed } from '../modules/constructedCards/public';

// The real catalog page with 18 cards, and the same page before its first
// response: the paired browser test compares the gallery tiles (and the
// table frame) of both states at the public page widths. The tile statistic
// line varies: Ready (a set name) and ShortText (mana) bound it.
const card = {
  card_id: 'blizzard:12345', dbf: 12345, name: { ru: 'Ученица мага', en: 'Mage apprentice' },
  text: { ru: 'Боевой клич: возьмите карту.' }, flavor: { ru: null }, class: 'MAGE', multi_class: [],
  card_set: 'CORE', card_type: { slug: 'MINION', name_ru: 'Существо' }, rarity: 'COMMON', mana_cost: 2,
  attack: 2, health: 3, durability: null, armor: null, artist: null, stats: null,
  images: { card: '/arena-logo-icon.webp', crop: '/arena-logo-icon.webp' },
  mechanics: [], referenced_tags: [], minion_type: null, spell_school: null,
} satisfies PublicCardCatalogSeed['cards'][number];
const seed = (count: number): PublicCardCatalogSeed => ({
  format: 'standard', rank: 'legend', period: { id: '1d', label: 'Последний день', patch: null, timeRange: null },
  updatedAt: null, sourceUrl: '', statsAccess: false, dataStatus: 'fresh', partial: false, datasetVersion: 'storybook',
  pagination: { page: 1, perPage: 60, total: count, totalPages: 1 },
  facets: { classes: ['MAGE'], sets: ['CORE'], mechanics: [], types: ['MINION'], rarities: ['COMMON'] },
  cards: Array.from({ length: count }, (_, index) => ({ ...card, card_id: `blizzard:${12345 + index}`, dbf: 12345 + index })),
});
const gallery = seed(18);
const table = seed(10);

const meta = {
  title: 'Card catalog/Measured loading geometry', component: StandardCards,
  args: { currentPath: '/standard/cards/standard/', initialSearch: '', initialCatalog: gallery,
    statsAccess: false, statsAccessLoading: false, authUser: null, navigatePath: fn(), onRefreshSubscription: fn(async () => null) },
  parameters: { layout: 'fullscreen', fullPage: true },
  decorators: [Story => <div style={{ paddingInline: 'clamp(.8rem, 2vw, 1.5rem)' }}><Story /></div>],
  beforeEach: () => {
    mocked(loadConstructedCardList).mockResolvedValue({ ok: true, status: 200, payload: gallery });
    mocked(prefetchConstructedCardList).mockResolvedValue(undefined);
  },
} satisfies Meta<typeof StandardCards>;
export default meta;
type Story = StoryObj<typeof meta>;
const pending = () => { mocked(loadConstructedCardList).mockReturnValue(new Promise(() => {})); };
// The search box keeps its own result-count output; the results area has one loader status.
const loader = (canvasElement: HTMLElement) => canvasElement.querySelector('.loading-surface[role="status"]');

export const Ready: Story = { play: async ({ canvas }) => {
  await expect(canvas.getAllByRole('article')).toHaveLength(18);
} };
// The default set sort shows «Дополнение · Основной набор», which wraps on narrow tiles; mana is one short line.
export const ShortText: Story = { args: { initialSearch: 'sort=mana' } };
export const Loading: Story = { args: { initialCatalog: undefined }, beforeEach: pending, play: async ({ canvas, canvasElement }) => {
  await expect(loader(canvasElement)).toHaveTextContent('Загружаем библиотеку карт');
  await expect(canvasElement.querySelectorAll('.loading-surface[role="status"]')).toHaveLength(1);
  await expect(canvas.queryByRole('article')).not.toBeInTheDocument();
  await expect(canvas.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
} };
export const TableReady: Story = { args: { initialCatalog: table, initialSearch: 'view=table' },
  beforeEach: () => { mocked(loadConstructedCardList).mockResolvedValue({ ok: true, status: 200, payload: table }); },
  play: async ({ canvas }) => { await expect(await canvas.findByRole('table')).toBeVisible(); } };
export const TableLoading: Story = { args: { initialCatalog: undefined, initialSearch: 'view=table' }, beforeEach: pending,
  play: async ({ canvas, canvasElement }) => {
    await expect(loader(canvasElement)).toHaveTextContent('Загружаем библиотеку карт');
    await expect(canvas.queryByRole('table')).not.toBeInTheDocument();
  } };
