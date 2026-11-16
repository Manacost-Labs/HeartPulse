import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { lazy, Suspense } from 'react';
import { loadPublicProfileCard, type PublicProfile } from '../../modules/identity/public';
import PlayerStatsPanel from './PlayerStatsPanel';
import PublicPlayerStats, { type PublicStatsCard } from './PublicPlayerStats';
import type { ProfileStatsLang } from '../../modules/playerStats/public';
import { profileBattlegroundsFixture, profileStandardFixture } from './profilePageFixtures';

const DAY = 86_400_000;
const day = (time: number) => Math.floor(time / DAY) * DAY;

/** What `/api/profiles/<id>/game-stats` sends: no recent games, days instead of times. */
const PUBLIC_ANSWERS: Record<string, unknown> = {
  standard: {
    ...profileStandardFixture,
    recentGames: [],
    rankSeries: profileStandardFixture.rankSeries.map((game, index) => ({ ...game, id: String(index + 1), startedAt: day(game.startedAt) })),
    decks: profileStandardFixture.decks.map(deck => ({ ...deck, lastPlayedAt: day(deck.lastPlayedAt) })),
  },
  battlegrounds: { ...profileBattlegroundsFixture, recentGames: [], global: { availability: 'none', mmr: 'TOP_50_PERCENT' } },
};
/** The owner's own answers keep the recent games and their web replays. */
const ACCOUNT_ANSWERS: Record<string, unknown> = { standard: profileStandardFixture, battlegrounds: profileBattlegroundsFixture };

function mockStats(base: string, answers: Record<string, unknown>, modes: Record<string, number> | null) {
  const original = window.fetch;
  window.fetch = async input => {
    const url = new URL(String(input instanceof Request ? input.url : input), window.location.href);
    if (url.pathname === `${base}/modes`) {
      return modes ? Response.json({ modes }) : Response.json({ error: 'Статистика не найдена' }, { status: 404 });
    }
    if (url.pathname === base) {
      const answer = answers[url.searchParams.get('mode') ?? ''];
      return answer ? Response.json(answer) : Response.json({ error: 'Нет данных' }, { status: 404 });
    }
    return original(input);
  };
  return () => { window.fetch = original; };
}

const BOTH_MODES = { battlegrounds: 1, standard: 1, wild: 0, arena: 0 };

const profile: PublicProfile = {
  publicProfileId: '7',
  displayName: 'Ледяной Странник',
  nickname: 'Ледяной Странник',
  avatarInitials: 'ЛС',
  memberSince: '2026-03',
  isSubscriber: true,
  showsStats: true,
};

const PublicProfileCard = lazy(loadPublicProfileCard);

const card: PublicStatsCard = ({ summary, children }) => (
  <PublicProfileCard profile={profile} onCopyLink={() => {}} summary={summary}>{children}</PublicProfileCard>
);

/** `/id/<n>/` as the page composes it: the card with the statistics' strip inside its header. */
function Page({ lang = 'ru' }: { lang?: ProfileStatsLang }) {
  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 16px' }}>
      <Suspense fallback={null}><PublicPlayerStats publicProfileId="7" card={card} lang={lang} /></Suspense>
    </div>
  );
}

/** The account's «Моя статистика»: the same panel inside the account section. */
function Account() {
  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: '16px' }}>
      <PlayerStatsPanel frame={(body, summary) => (
        <section style={{ display: 'grid', gap: '1rem' }} aria-labelledby="account-game-stats-title">
          <h2 id="account-game-stats-title">Моя статистика</h2>
          {summary}
          {body}
        </section>
      )} />
    </div>
  );
}

const meta = {
  title: 'Pages/Public Profile',
  component: Page,
  parameters: { layout: 'fullscreen', backgrounds: { default: 'parchment' } },
} satisfies Meta<typeof Page>;

export default meta;
type Story = StoryObj<typeof meta>;

/** About 200 Standard games over five decks and 60 Battlegrounds games. */
export const ActivePlayer: Story = {
  beforeEach: () => mockStats('/api/profiles/7/game-stats', PUBLIC_ANSWERS, BOTH_MODES),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('list', { name: 'Колоды' })).toBeVisible();
    await expect(canvas.getByRole('radiogroup', { name: 'Период' })).toBeVisible();
    await expect(canvas.getAllByRole('button', { name: 'Скопировать код колоды' })).toHaveLength(1);
    // The public copy has days only, never a time of day, and no recent games.
    await expect(canvasElement.textContent).not.toMatch(/\d{2}:\d{2}/);
    await expect(canvas.queryByRole('heading', { name: 'Последние игры' })).toBeNull();
    await userEvent.click(canvas.getByRole('radio', { name: 'Поля сражений' }));
    await expect(await canvas.findByRole('heading', { name: 'Герои' })).toBeVisible();
  },
};

/** The statistics are open, but the app has not sent a game yet: the page invites to install it. */
export const NewPlayer: Story = {
  beforeEach: () => mockStats('/api/profiles/7/game-stats', PUBLIC_ANSWERS, null),
  play: async ({ canvasElement }) => {
    const link = await within(canvasElement).findByRole('link', { name: 'Установить Hearthpulse' });
    await expect(link).toHaveAttribute('href', '/download/');
  },
};

export const English: Story = {
  args: { lang: 'en' },
  beforeEach: () => mockStats('/api/profiles/7/game-stats', PUBLIC_ANSWERS, BOTH_MODES),
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('list', { name: 'Decks' })).toBeVisible();
  },
};

/** The owner's view: recent games with their web replays. */
export const AccountStats: Story = {
  render: () => <Account />,
  beforeEach: () => mockStats('/api/account/game-stats', ACCOUNT_ANSWERS, BOTH_MODES),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Последние игры' })).toBeVisible();
    await expect(canvas.getAllByRole('link', { name: /^Смотреть:/ })).toHaveLength(4);
    await userEvent.click(canvas.getByRole('button', { name: 'Показать ещё' }));
    await expect(canvas.getAllByRole('link', { name: /^Смотреть:/ }).length).toBeGreaterThan(4);
  },
};
