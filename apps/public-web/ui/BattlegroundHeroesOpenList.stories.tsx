import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import { BattlegroundHeroesOpenList } from './BattlegroundHeroesOpenList';
import type { PublicBattlegroundHeroesRanking } from '@/apps/public-web/lib/publicBattlegroundHeroesData';

const ranking = (mode: 'solo' | 'duos'): PublicBattlegroundHeroesRanking => ({
  mode, updatedAt: '2026-11-20T06:01:09.668Z', source: 'HSReplay',
  heroes: [['Лорд Джараксус', 'A', 4.04, 52.71], ['Изера', 'A', 4.04, 25.69], ['Кнопка', 'B', 4.31, 71.31], ['Иллидан', 'C', 4.52, 38.96]]
    .map(([name, tier, avgPlacement, pickRate], index) => ({
      dbfId: 59807 + index, name: String(name), image: null, tier: String(tier), avgPlacement: Number(avgPlacement), top4Rate: null,
      pickRate: Number(pickRate), games: null, heroPowerName: `Сила ${index}`, heroPowerText: null, heroPowerImage: null,
      bestComposition: null, keyMinions: [],
    })),
});

const meta = {
  title: 'Battlegrounds/Hero tier list (guest)', component: BattlegroundHeroesOpenList,
  args: {
    solo: ranking('solo'), duos: ranking('duos'), onNavigate: fn(),
    paywall: { authUser: null, subscriptionStatus: null, subscriptionLoading: false, onRefreshSubscription: async () => null },
  },
  decorators: [Story => <div className="arena-app-battlegrounds"><Story /></div>],
} satisfies Meta<typeof BattlegroundHeroesOpenList>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The subscriber's view on the open data: «Топ 50%» is on, the narrower ranges are locked and open the offer. */
export const LockedRanges: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: /Лорд Джараксус/ })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Топ 50%' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(canvas.getByRole('button', { name: /Топ 5% — по подписке/ }));
    await expect(canvas.getByRole('button', { name: 'Топ 50%' })).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.getByText(/доступны подписчикам/)).toBeVisible();
  },
};

export const Unavailable: Story = { args: { solo: null, duos: null } };
