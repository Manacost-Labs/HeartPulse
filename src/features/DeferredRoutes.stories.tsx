import type { ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { HSCard, WinratesView as Winrates } from './DeferredRoutes';

const portraitSource = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="512" height="776"%3E%3Crect width="512" height="776" fill="%23315576"/%3E%3C/svg%3E';
const skeletonCrewRender = new URL('./fixtures/skeleton-crew-render.webp', import.meta.url).href;
const horizonsEdgeRender = new URL('./fixtures/horizons-edge-render.webp', import.meta.url).href;
const leeroyRender = new URL('./fixtures/leeroy-render.webp', import.meta.url).href;
const fireballRender = new URL('./fixtures/fireball-render.webp', import.meta.url).href;
const wideSource = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="960" height="320"%3E%3Crect width="960" height="320" fill="%23644c82"/%3E%3C/svg%3E';

const card = (name: string, imageRu?: string): ComponentProps<typeof HSCard>['card'] => ({
  cardId: '',
  name,
  rarity: 'rare',
  cost: 4,
  imageRu,
  score: 75,
  classKey: 'mage',
});

const meta = {
  title: 'Arena/HSCard geometry',
  component: HSCard,
  args: {
    card: card('Карта для примера', portraitSource),
    onClick: () => undefined,
  },
  parameters: {
    docs: {
      description: {
        component: 'Карты из разных источников и fallback занимают одну и ту же ячейку тир-листа.',
      },
    },
  },
} satisfies Meta<typeof HSCard>;

export default meta;

type Story = StoryObj<typeof meta>;

function CardGrid() {
  return (
    <div className="arena-app-tierlist" style={{ maxWidth: 760, padding: 24 }}>
      <div className="tierlist-card-grid">
        <HSCard card={card('Портретный источник', portraitSource)} onClick={() => undefined} />
        <HSCard card={card('Широкий источник', wideSource)} onClick={() => undefined} />
        <HSCard card={card('Fallback без изображения')} onClick={() => undefined} />
      </div>
    </div>
  );
}

export const DisparateSourcesAndFallback: Story = { render: () => <CardGrid /> };

type GalleryCard = ComponentProps<typeof HSCard>['card'];
const galleryCard = (name: string, rarity: string, type: string, imageRu?: string): GalleryCard => ({
  ...card(name, imageRu), rarity, type,
});
/** Blizzard renders of every frame and rarity a tier row mixes, plus the fallback. */
const RARITY_FRAME_CARDS: GalleryCard[] = [
  galleryCard('Огненный шар', 'common', 'SPELL', fireballRender),
  galleryCard('Костяк', 'rare', 'MINION', skeletonCrewRender),
  galleryCard('Край горизонта', 'rare', 'LOCATION', horizonsEdgeRender),
  galleryCard('Костяк (эпическая рамка)', 'epic', 'MINION', skeletonCrewRender),
  galleryCard('Лирой Дженкинс', 'legendary', 'MINION', leeroyRender),
  galleryCard('Fallback без изображения', 'legendary', 'MINION'),
];

/**
 * One tier row in the real gallery grid: a location, a dragon-framed
 * legendary and the fallback share one card box and one rarity glow rule.
 * `tests/arena-tier-card-geometry.browser.test.mjs` measures it.
 */
export const RarityAndFrames: Story = {
  render: () => (
    <div className="arena-app-tierlist" style={{ maxWidth: 1360, padding: 24 }}>
      <div className="tierlist-card-grid">
        {RARITY_FRAME_CARDS.map(item => <HSCard key={item.name} card={item} onClick={() => undefined} />)}
      </div>
    </div>
  ),
};

type WinratesProps = ComponentProps<typeof Winrates>;

const winrateProps: WinratesProps = {
  state: { status: 'ready', data: {
    classes: [{ id: 'mage', name: 'Маг', winrate: 54.2, color: '#4c78d0', games: 12890 }],
    updatedAt: '2026-09-10T12:00:00.000Z', source: 'hsreplay',
  } },
  onRetry: () => undefined,
  onNavigate: () => undefined,
  authUser: null,
  subscriptionStatus: null,
  subscriptionLoading: true,
  onRefreshSubscription: async () => null,
};

export const StableWinrateLabel: Story = {
  render: () => (
    <div className="arena-app-winrates" style={{ maxWidth: 760, padding: 24 }}>
      <Winrates {...winrateProps} />
    </div>
  ),
};

const twoClasses: WinratesProps = {
  ...winrateProps,
  state: { status: 'ready', data: {
    classes: [
      { id: 'mage', name: 'Маг', winrate: 54.2, color: '#4c78d0', games: 12890 },
      { id: 'warrior', name: 'Воин', winrate: 49.1, color: '#c44d44', games: 11200 },
    ],
    updatedAt: '2026-09-10T12:00:00.000Z', source: 'hsreplay',
  } },
};

/**
 * Cards from three kinds of source next to a two-class chart, with a Tailwind
 * utility beside them. `tests/arena-card-motion.browser.test.mjs` measures the
 * card geometry, the chart entrance and reduced motion on this story.
 */
export const CardsAndClassChart: Story = {
  render: () => (
    <>
      <div className="arena-motion-tailwind-probe p-3">Tailwind utility-layer probe</div>
      <CardGrid />
      <div className="arena-app-winrates" style={{ maxWidth: 760, padding: 24 }}>
        <Winrates {...twoClasses} />
      </div>
    </>
  ),
};
