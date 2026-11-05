import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import PublicPlayerStats from './PublicPlayerStats';
import { standardFixture } from './playerStatsFixtures';

const DAY = 86_400_000;
const day = (time: number) => Math.floor(time / DAY) * DAY;

/** The public copy the server sends: times rounded to the day, positions instead of ids. */
const publicStandard = {
  ...standardFixture,
  rankSeries: standardFixture.rankSeries.map((game, index) => ({ ...game, id: String(index + 1), startedAt: day(game.startedAt) })),
  // The tracker reports a code for decks it saw in full; the first one here has one.
  decks: standardFixture.decks.map((deck, index) => ({
    ...deck, lastPlayedAt: day(deck.lastPlayedAt), deckCode: index === 0 ? 'AAECAZ8FBomwBNy5BJvDBM3SBNXSBIGhBQyU1ATI1AT/3wQAAA==' : deck.deckCode,
  })),
};

function mockPublicStats(modes: Record<string, number> | null) {
  const original = window.fetch;
  window.fetch = async input => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('/api/profiles/7/game-stats/modes')) {
      return modes ? Response.json({ modes }) : Response.json({ error: 'Статистика не найдена' }, { status: 404 });
    }
    if (url.includes('/api/profiles/7/game-stats?')) return Response.json(publicStandard);
    return original(input);
  };
  return () => { window.fetch = original; };
}

const meta = {
  title: 'Features/Public Player Stats',
  component: PublicPlayerStats,
  args: { publicProfileId: '7' },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof PublicPlayerStats>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A profile that shows its Standard games: decks with their codes, days without times. */
export const StandardDecks: Story = {
  beforeEach: () => mockPublicStats({ battlegrounds: 0, standard: 12, wild: 0, arena: 0 }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Статистика и колоды' })).toBeVisible();
    await expect(await canvas.findByRole('button', { name: 'Скопировать код колоды' })).toBeVisible();
    await expect(canvasElement.textContent).not.toMatch(/\d{2}:\d{2}/);
  },
};

/** The owner switched the statistics on before the tracker sent a game. */
export const NoGamesYet: Story = {
  beforeEach: () => mockPublicStats(null),
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText(/ещё не прислал ни одной партии/)).toBeVisible();
  },
};
