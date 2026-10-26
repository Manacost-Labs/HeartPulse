import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { LeaderboardBoard, LeaderboardPlayer, LeaderboardSnapshot, LeaderboardStats, LeaderboardTable } from '../model/types';
import { LeaderboardControls, LeaderboardJump, LeaderboardSearch } from './LeaderboardControls';
import { LeaderboardPlayerCard } from './LeaderboardPlayerCard';
import { LeaderboardSummary } from './LeaderboardSummary';
import { LeaderboardTableView } from './LeaderboardTableView';
import { LeaderboardCollecting, LeaderboardMissing, LeaderboardSummarySkeleton, LeaderboardTableSkeleton, LeaderboardsUnavailable } from './LeaderboardsSkeleton';
import './Leaderboards.css';

// Числа взяты с живого прогона hs-data-api 25.10.2026 (Поля сражений, Европа, сезон 19).
const board: LeaderboardBoard = { mode: 'battlegrounds', region: 'EU', season: 19, seasonStart: null, latest: true, final: false, rated: true };
const snapshot: LeaderboardSnapshot = { day: '2026-10-25', capturedAt: '2026-10-25T16:10:02.000Z', players: 6543, stored: 6543, truncated: false, stale: false };
const names = ['XQN', 'СтоякБезДела', 'Radiy', 'Explosion', 'Viconia', 'ХитрыйКраб', 'bosola98', 'Bob', 'ZerGgBoY', 'Exuni'];

const table: LeaderboardTable = {
  board, snapshot, query: null, total: 6543, page: 1, pageSize: 50, pages: 131, hasPrevious: true,
  rows: names.map((name, index) => ({
    rank: index + 1, name, rating: 20104 - index * 243, previousRank: index === 2 ? null : index === 0 ? 2 : index === 1 ? 1 : index + 3,
    streamer: name === 'Viconia' ? { slug: 'viconia', name: 'Viconia' } : null,
  })),
};
const stats: LeaderboardStats = {
  board, snapshot, topRating: 20104,
  thresholds: [{ rank: 100, reached: true, rating: 13010 }, { rank: 1000, reached: true, rating: 10120 }, { rank: 5000, reached: true, rating: 8320 }],
  rating: { min: 8000, max: 20104, mean: 9480.2, median: 9010 },
  histogram: [1800, 1300, 1050, 800, 600, 420, 260, 150, 90, 40, 20, 13].map((players, index) => ({ from: 8000 + index * 500, to: 8500 + index * 500, players })),
  series: ['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'].map((day, index) => ({
    day, players: 6100 + index * 110, top: 19800 + index * 76, at100: 12800 + index * 52, at1000: 9950 + index * 42, at5000: 8200 + index * 30,
  })),
};
const standard: LeaderboardStats = {
  ...stats, board: { ...board, mode: 'standard', season: 156, seasonStart: '2026-10-01', rated: false },
  snapshot: { ...snapshot, players: 16625, stored: 16625 }, topRating: null, histogram: null, rating: null,
  thresholds: stats.thresholds.map(item => ({ ...item, rating: null })),
  series: stats.series.map(point => ({ ...point, players: point.players * 2, top: null, at100: null, at1000: null, at5000: null })),
};
const player: LeaderboardPlayer = {
  region: 'EU', name: 'XQN', sharedName: false, regions: ['EU', 'US'], streamer: { slug: 'xqn', name: 'XQN' },
  seasons: [
    { mode: 'battlegrounds', season: 19, seasonStart: null, latest: true, final: false, rated: true, bestRank: 1, bestDay: '2026-10-25', lastRank: 1, lastRating: 20104, lastDay: '2026-10-25', inLatest: true,
      series: [5, 4, 4, 2, 1].map((rank, index) => ({ day: `2026-10-2${index + 1}`, rank, rating: 19700 + index * 100, players: 6100 + index * 110, final: false })) },
    { mode: 'battlegroundsduo', season: 19, seasonStart: null, latest: true, final: false, rated: true, bestRank: 14, bestDay: '2026-10-25', lastRank: 14, lastRating: 17800, lastDay: '2026-10-25', inLatest: true,
      series: [{ day: '2026-10-25', rank: 14, rating: 17800, players: 2028, final: false }] },
    { mode: 'battlegrounds', season: 18, seasonStart: null, latest: false, final: true, rated: true, bestRank: 2, bestDay: '2026-10-24', lastRank: 2, lastRating: 17016, lastDay: '2026-10-24', inLatest: true,
      series: [{ day: '2026-10-24', rank: 2, rating: 17016, players: 7100, final: true }] },
  ],
};

const meta = {
  title: 'Modules/Leaderboards',
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const RatedSummary: Story = { render: () => <div className="leaderboards"><LeaderboardSummary stats={stats} onRank={() => undefined} /></div> };

export const UnratedSummary: Story = { render: () => <div className="leaderboards"><LeaderboardSummary stats={standard} onRank={() => undefined} /></div> };

const onPage = fn();
const onSelect = fn();

/** Раздел целиком, как на странице: панель выбора, сводка и таблица в одной рамке. */
export const Board: Story = {
  render: () => <div className="leaderboards" data-mode="battlegrounds"><section className="leaderboards-board" aria-label="Таблица лидеров">
    <LeaderboardControls selection={{ mode: 'battlegrounds', region: 'EU', season: null, page: 1, query: '', player: null, rank: null }}
      seasons={[{ id: 19, start: null, latest: true, final: false, players: 6543 }, { id: 18, start: null, latest: false, final: true, players: 7100 }]} onSelect={onSelect}>
      <LeaderboardJump max={6543} onJump={() => undefined} />
      <LeaderboardSearch query="" onSelect={onSelect} />
    </LeaderboardControls>
    <LeaderboardSummary stats={stats} onRank={() => undefined} />
    <LeaderboardTableView table={table} busy={false} selectedPlayer={null} targetRank={null} onPage={() => undefined} onPlayer={() => undefined} />
  </section></div>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Твист' }));
    await expect(onSelect).toHaveBeenCalledWith({ mode: 'twist' });
  },
};

export const Table: Story = {
  render: () => <div className="leaderboards"><LeaderboardTableView table={table} busy={false} selectedPlayer="XQN" targetRank={5}
    onPage={onPage} onPlayer={() => undefined} /></div>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('columnheader', { name: 'За сутки' })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Далее' }));
    await expect(onPage).toHaveBeenCalledWith(2);
  },
};

export const SearchWithoutMatches: Story = {
  render: () => <div className="leaderboards"><LeaderboardTableView table={{ ...table, query: 'ничего', total: 0, pages: 1, rows: [] }}
    busy={false} selectedPlayer={null} targetRank={null} onPage={() => undefined} onPlayer={() => undefined} /></div>,
};

const actions = { onShow: fn(), onRegion: fn(), onClose: fn(), onRetry: fn(), onMe: fn() };

export const PlayerCard: Story = {
  render: () => <div className="leaderboards"><LeaderboardPlayerCard name="XQN" region="EU" mode="battlegrounds"
    state={{ key: 'x', status: 'ready', value: player }} me={null} scrollOnOpen={false} actions={actions} /></div>,
};

export const PlayerCardLoading: Story = {
  render: () => <div className="leaderboards"><LeaderboardPlayerCard name="XQN" region="EU" mode="battlegrounds"
    state={{ key: 'x', status: 'loading', value: null }} me={null} scrollOnOpen={false} actions={actions} /></div>,
};

export const Loading: Story = { render: () => <div className="leaderboards"><LeaderboardSummarySkeleton /><LeaderboardTableSkeleton /></div> };

export const UnratedTable: Story = {
  render: () => <div className="leaderboards"><LeaderboardTableView table={{ ...table, board: { ...board, mode: 'standard', season: 156, rated: false },
    rows: table.rows.map(row => ({ ...row, rating: null })) }} busy={false} selectedPlayer={null} targetRank={null} onPage={() => undefined} onPlayer={() => undefined} /></div>,
};

export const Collecting: Story = { render: () => <div className="leaderboards"><LeaderboardCollecting mode="arena" region="EU" /></div> };

export const NotCollected: Story = { render: () => <div className="leaderboards"><LeaderboardMissing /></div> };

export const Unavailable: Story = { render: () => <div className="leaderboards"><LeaderboardsUnavailable onRetry={() => undefined} /></div> };
