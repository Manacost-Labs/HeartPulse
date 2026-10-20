import type { ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import { TierList } from './DeferredRoutes';
import type { TierCard, TierlistData } from '../modules/arenaTierList/public';

// Fixed values are story fixtures only; the production view requires API data.
const render = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="512" height="776"%3E%3Crect width="512" height="776" fill="%23745133"/%3E%3C/svg%3E';
const tierCards = (tier: string): TierCard[] => Array.from({ length: 12 }, (_, index) => ({
  cardId: `${tier}-fixture-${index}`, name: `Карта ${tier}${index + 1}`, score: 80, rarity: 'common', classKey: 'any',
}));
const classNames = ['Рыцарь смерти', 'Охотник на демонов', 'Друид', 'Охотник', 'Маг', 'Паладин', 'Жрец', 'Разбойник', 'Шаман', 'Чернокнижник', 'Воин', 'Нейтральные'];
const classIds = ['death-knight', 'demon-hunter', 'druid', 'hunter', 'mage', 'paladin', 'priest', 'rogue', 'shaman', 'warlock', 'warrior', 'any'];
const cards = [...tierCards('s'), ...tierCards('a')];
const data: TierlistData = {
  updatedAt: '2026-10-19T07:00:00Z', source: 'hsreplay.net',
  sections: classIds.map((id, index) => ({
    id, name: classNames[index], color: '#745133', textDark: true, totalCards: cards.length,
    tiers: [
      { tier: 'S', label: 'Отлично', description: '', cards: cards.slice(0, 12) },
      { tier: 'A', label: 'Хорошо', description: '', cards: cards.slice(12) },
    ],
  })),
  cards: Object.fromEntries(cards.map(card => [card.cardId, { cost: 3, imageHa: '', imageRu: render, type: 'MINION' }])),
};
const empty: TierlistData = { sections: [], cards: {}, updatedAt: null, source: 'hsreplay' };

const meta = {
  title: 'Tier list/Measured loading geometry', component: TierList,
  args: {
    data, loading: false, error: false, companionIds: new Set<string>(), tierlistSource: 'hsreplay',
    onTierlistSourceChange: fn(), switchingTierlistSource: false, onNavigate: fn(), authUser: null,
    subscriptionStatus: null, subscriptionLoading: false, onRefreshSubscription: async () => null, accessGranted: true,
  } satisfies ComponentProps<typeof TierList>,
  parameters: { layout: 'fullscreen', fullPage: true },
  decorators: [Story => <div className="arena-app-shell arena-app-game-data arena-app-tierlist"
    style={{ maxWidth: 1180, marginInline: 'auto', paddingInline: 'clamp(.8rem, 2vw, 1.5rem)' }}><Story /></div>],
} satisfies Meta<typeof TierList>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Two full tiers of twelve cards with the HSReplay table toggle. */
export const Ready: Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole('group', { name: 'Класс карт' })).toBeVisible();
    await expect(canvasElement.querySelectorAll('.tierlist-group')).toHaveLength(2);
    await expect(canvasElement.querySelectorAll('.tierlist-card-grid .hs-tier-card')).toHaveLength(24);
  },
};
export const Loading: Story = {
  args: { data: empty, loading: true },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Загружаем тир-лист');
    await expect(canvas.getAllByRole('status')).toHaveLength(1);
    await expect(canvas.queryByRole('group', { name: 'Класс карт' })).not.toBeInTheDocument();
    await expect(canvas.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
    await expect(canvasElement.querySelectorAll('.tierlist-skeleton .arena-tier-classes > .loading-block')).toHaveLength(13);
    // The source switcher is not data: it stays usable while the list loads.
    await expect(canvas.getByRole('button', { name: /HearthArena/ })).toBeEnabled();
  },
};
/** Sources without the HSReplay table have no gallery/table toggle. */
export const LoadingWithoutTable: Story = {
  args: { data: { ...empty, source: 'heartharena' }, loading: true, tierlistSource: 'heartharena' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.tierlist-skeleton-view')).toBeNull();
  },
};
