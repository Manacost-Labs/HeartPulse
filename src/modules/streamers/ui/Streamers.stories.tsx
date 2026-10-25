import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { LiveStream, StreamerDeck, StreamerPage, StreamersPage, StreamerSummary } from '../model/types';
import { StreamersSkeleton, StreamersUnavailable } from './StreamersSkeleton';
import { StreamersView } from './StreamersView';
import { StreamerView } from './StreamerView';

// Данные живого прогона hs-data-api 25.10.2026 (HSGuru и Twitch), несколько строк.
const deck = (overrides: Partial<StreamerDeck>): StreamerDeck => ({
  deckId: 42709303, code: 'AAECAa0GBvCfBJegBKjfB+L6B9z7B/OJCAyg+waFhgeyxQevyQew3wf04Afo8Qfh+gfk+gf7iQj8iQjBjAgAAA==',
  archetype: 'Egg Priest', archetypeLabel: 'Жрец на яйцах', classKey: 'priest', format: 'standard', peakRank: 12, latestRank: 40,
  wins: 9, losses: 4, lastPlayedAt: '2026-10-25T00:37:46.000Z', vodUrl: 'https://www.twitch.tv/videos/2909721478?t=5h41m20s', onStream: false,
  ...overrides,
});

const nohands: StreamerSummary = {
  slug: 'nohandsgamer', name: 'NoHandsGamer', avatarUrl: null, followers: 74_988,
  links: [
    { kind: 'twitch', url: 'https://www.twitch.tv/nohandsgamer' },
    { kind: 'youtube', url: 'https://www.youtube.com/c/NoHandsGamerVODs' }, { kind: 'x', url: 'https://x.com/Nohandsgamer' },
  ],
  live: null, decksTotal: 146, lastPlayedAt: '2026-10-25T00:37:46.000Z',
  recentDecks: [deck({}), deck({ deckId: 42563104, archetype: 'Blood DK', archetypeLabel: 'Рыцарь смерти крови', classKey: 'deathknight', peakRank: 25 })],
};

const moquaiLive = { title: '[EU] Legend | WarlockStone', viewers: 14, mode: 'standard', startedAt: '2026-10-25T15:54:23.000Z', streamUrl: 'https://www.twitch.tv/moquaitv', thumbnailUrl: null };

const moquai: StreamerSummary = {
  slug: 'moquaitv', name: 'MoquaiTV', avatarUrl: null, followers: null,
  links: [{ kind: 'twitch', url: 'https://www.twitch.tv/moquaitv' }],
  live: moquaiLive,
  decksTotal: 102, lastPlayedAt: '2026-10-25T16:24:05.000Z',
  recentDecks: [deck({ deckId: 42692433, archetype: 'Thief Priest', archetypeLabel: 'Жрец-вор', peakRank: 6623, onStream: true, vodUrl: null })],
};

const live: LiveStream[] = [
  { login: 'moquaitv', name: 'MoquaiTV', slug: 'moquaitv', avatarUrl: null, language: null, live: moquaiLive, deck: moquai.recentDecks[0] },
  { login: 'reqvam', name: 'reqvam', slug: 'reqvam', avatarUrl: null, language: 'ru',
    live: { title: 'High Legend Ladder - Best Decks Rotation !gx !deck', viewers: 856, mode: null, startedAt: '2026-10-25T13:37:53.000Z', streamUrl: 'https://www.twitch.tv/reqvam', thumbnailUrl: null },
    deck: null },
];

const page: StreamersPage = { live, streamers: [moquai, nohands], total: 226, offset: 0, filters: { format: null, classKey: null } };

const streamerPage: StreamerPage = {
  streamer: { ...nohands, description: null, facets: [
    { format: 'standard', classKey: 'priest', decks: 31 }, { format: 'standard', classKey: 'deathknight', decks: 11 }, { format: 'wild', classKey: 'mage', decks: 4 },
  ] },
  decks: [deck({}), deck({ deckId: 42563104, archetype: 'Blood DK', archetypeLabel: 'Рыцарь смерти крови', classKey: 'deathknight', peakRank: null, wins: 1, losses: 3, vodUrl: null })],
  total: 46, offset: 0, filters: { format: null, classKey: null },
};

const meta = {
  title: 'Modules/Streamers',
  component: StreamersView,
  parameters: { layout: 'padded' },
  args: { page, live, loading: false, loadingMore: false, onFilters: fn(), onMore: fn() },
} satisfies Meta<typeof StreamersView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Catalog: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Сейчас в эфире' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Вольный' }));
    await expect(args.onFilters).toHaveBeenCalledWith({ format: 'wild', classKey: null });
    await userEvent.click(canvas.getByRole('button', { name: 'На русском' }));
    await expect(canvas.queryByText('MoquaiTV', { selector: '.streamers-live__name *' })).toBeNull();
  },
};

export const Filtering: Story = { args: { loading: true } };

export const NothingFound: Story = { args: { page: { ...page, streamers: [], total: 0 }, live: [] } };

export const Streamer: Story = { render: () => <StreamerView page={streamerPage} loading={false} loadingMore={false} onFilters={fn()} onMore={fn()} /> };

export const Loading: Story = { render: () => <StreamersSkeleton /> };

export const Unavailable: Story = { render: () => <StreamersUnavailable onRetry={fn()} /> };
