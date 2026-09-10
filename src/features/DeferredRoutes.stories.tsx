import type { ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { HSCard, Winrates } from './DeferredRoutes';

const portraitSource = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="512" height="776"%3E%3Crect width="512" height="776" fill="%23315576"/%3E%3C/svg%3E';
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

export const DisparateSourcesAndFallback: Story = {
  render: () => (
    <div className="arena-app-tierlist" style={{ maxWidth: 760, padding: 24 }}>
      <div className="tierlist-card-grid">
        <HSCard card={card('Портретный источник', portraitSource)} onClick={() => undefined} />
        <HSCard card={card('Широкий источник', wideSource)} onClick={() => undefined} />
        <HSCard card={card('Fallback без изображения')} onClick={() => undefined} />
      </div>
    </div>
  ),
};

type WinratesProps = ComponentProps<typeof Winrates>;

const winrateProps: WinratesProps = {
  classes: [{ id: 'mage', name: 'Маг', winrate: 54.2, color: '#4c78d0', games: 12890 }],
  loading: false,
  switching: false,
  error: false,
  updatedAt: '2026-09-10T12:00:00.000Z',
  winrateSource: 'hsreplay',
  onSourceChange: () => undefined,
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
