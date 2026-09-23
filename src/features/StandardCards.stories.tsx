import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, mocked, userEvent, within } from 'storybook/test';
import StandardCards from './StandardCards';
import { loadConstructedCardList, prefetchConstructedCardList } from './constructedCardListPrefetch';
import { prefetchConstructedCardDetail } from './constructedCardDetailPrefetch';
import type { PublicCardCatalogSeed } from '../modules/constructedCards/public';

const seed: PublicCardCatalogSeed = {
  format: 'standard', rank: 'legend', period: { id: '1d', label: 'Последний день', patch: null, timeRange: null },
  updatedAt: null, sourceUrl: '', statsAccess: false, dataStatus: 'fresh', partial: false, datasetVersion: 'storybook',
  pagination: { page: 1, perPage: 60, total: 1, totalPages: 1 },
  facets: { classes: ['MAGE'], sets: ['CORE'], mechanics: [], types: ['MINION'], rarities: ['COMMON'] },
  cards: [{ card_id: 'blizzard:12345', dbf: 12345, name: { ru: 'Ученица мага', en: 'Mage apprentice' },
    text: { ru: 'Боевой клич: возьмите карту.' }, flavor: { ru: null }, class: 'MAGE', multi_class: [],
    card_set: 'CORE', card_type: { slug: 'MINION', name_ru: 'Существо' }, rarity: 'COMMON', mana_cost: 2,
    attack: 2, health: 3, durability: null, armor: null, artist: null, stats: null,
    images: { card: '/arena-logo-icon.webp', crop: '/arena-logo-icon.webp' },
    mechanics: [], referenced_tags: [], minion_type: null, spell_school: null }],
};
const empty = { ...seed, cards: [], pagination: { ...seed.pagination, total: 0 } };
const meta = {
  title: 'Constructed cards/Catalog page', component: StandardCards,
  args: { currentPath: '/standard/cards/standard/', initialSearch: '', initialCatalog: seed,
    statsAccess: false, statsAccessLoading: false, authUser: null, navigatePath: fn(), onRefreshSubscription: fn(async () => null) },
  beforeEach: () => {
    mocked(loadConstructedCardList).mockResolvedValue({ ok: true, status: 200, payload: seed });
    mocked(prefetchConstructedCardList).mockResolvedValue(undefined);
    mocked(prefetchConstructedCardDetail).mockResolvedValue(undefined);
  },
} satisfies Meta<typeof StandardCards>;
export default meta;
type Story = StoryObj<typeof meta>;
export const PublicCatalog: Story = { play: async ({ canvasElement, args }) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: 'Таблица' }));
  await expect(canvas.getByRole('table')).toBeVisible();
  await userEvent.click(canvas.getByRole('link', { name: 'Открыть карту Ученица мага' }));
  await expect(args.navigatePath).toHaveBeenCalledWith(expect.stringContaining('/standard/cards/standard/blizzard%3A12345'));
} };
export const EmptySearch: Story = { args: { initialCatalog: empty, initialSearch: 'query=НетТакойКарты' },
  beforeEach: () => { mocked(loadConstructedCardList).mockResolvedValue({ ok: true, status: 200, payload: empty }); } };
export const RetryAfterFailure: Story = { args: { initialCatalog: undefined },
  beforeEach: () => { mocked(loadConstructedCardList).mockResolvedValueOnce({ ok: false, status: 503, payload: empty }); },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('heading', { name: 'Библиотека карт временно недоступна' });
    await userEvent.click(canvas.getByRole('button', { name: 'Повторить' }));
    await expect(await canvas.findByText('Ученица мага')).toBeVisible();
  } };
