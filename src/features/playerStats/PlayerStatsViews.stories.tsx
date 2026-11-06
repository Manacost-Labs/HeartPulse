import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { expect, userEvent } from 'storybook/test';
import {
  PROFILE_STATS_TEXT,
  type BattlegroundsStats,
} from '../../modules/playerStats/public';
import { ArenaStatsView } from './ArenaStatsView';
import { BattlegroundsStatsView } from './BattlegroundsStatsView';
import { ConstructedStatsView } from './ConstructedStatsView';
import { PlayerStatsEmpty } from './PlayerStatsEmpty';
import { arenaFixture, battlegroundsFixture, standardFixture } from './playerStatsFixtures';
import '../../vendor/varylo-ui/styles/index.css';
import '../../shared/ui/varyloParchment.css';
import './PlayerStatsPanel.css';
import './ProfileStats.css';

const text = PROFILE_STATS_TEXT.ru;

/** Global values shaped like the HSReplay mirror's, so the «в среднем» comparisons can be reviewed. */
const withGlobal: BattlegroundsStats = {
  ...battlegroundsFixture,
  global: { availability: 'available', mmr: 'TOP_20_PERCENT' },
  heroes: battlegroundsFixture.heroes.map((hero, index) => ({
    ...hero,
    global: {
      averagePlacement: 4.1 + index * 0.08,
      pickRatePercent: 48 + index * 3,
      placementPercent: [14, 13, 13, 12, 12, 12, 12, 12],
      combat: Array.from({ length: 12 }, (_, turn) => ({ turn: turn + 1, winrate: 46 + Math.sin(turn + index) * 6 })),
    },
  })),
};

function Frame({ children }: { children: ReactNode }) {
  return <div className="player-stats-panel profile-stats hp-varylo-parchment">{children}</div>;
}

const meta = {
  title: 'Features/Player Stats',
  parameters: { layout: 'padded', backgrounds: { default: 'parchment' } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Battlegrounds: Story = {
  render: () => <Frame><BattlegroundsStatsView stats={battlegroundsFixture} mmr="TOP_50_PERCENT" onMmrChange={() => {}} text={text} /></Frame>,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('figure', { name: /^Места:/ })).toBeVisible();
    await expect(canvas.getByText(/открывает/)).toBeVisible();
    await expect(canvas.getByRole('heading', { name: 'Герои' })).toBeVisible();
    await expect(canvas.getAllByRole('link', { name: /^Смотреть:/ })[0]).toBeVisible();
  },
};

export const BattlegroundsVsGlobal: Story = {
  render: () => <Frame><BattlegroundsStatsView stats={withGlobal} mmr="TOP_20_PERCENT" onMmrChange={() => {}} text={text} /></Frame>,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('radiogroup', { name: 'Сравнивать с игроками' })).toBeVisible();
    await expect(canvas.queryByText(/открывает/)).toBeNull();
  },
};

export const RatingHover: Story = {
  render: () => <Frame><BattlegroundsStatsView stats={battlegroundsFixture} mmr="TOP_50_PERCENT" onMmrChange={() => {}} text={text} /></Frame>,
  play: async ({ canvas, canvasElement }) => {
    const chart = canvas.getByRole('img', { name: /Рейтинг после каждой/ });
    chart.focus();
    await userEvent.keyboard('{ArrowLeft}');
    // The card is decorative for screen readers; the live region reads the same game.
    await expect(canvas.getByText(/-е место, рейтинг \d+/)).toBeInTheDocument();
    await expect(canvasElement.querySelector('.player-stats-timeline__card .player-stats-board')).not.toBeNull();
  },
};

export const Standard: Story = {
  render: () => <Frame><ConstructedStatsView stats={standardFixture} text={text} /></Frame>,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('list', { name: 'Колоды' })).toBeVisible();
    // Every opponent class is a row of the heat grid, and its «Всего» repeats no separate table.
    await expect(canvas.getByRole('table', { name: /против классов соперников/ })).toBeVisible();
    await expect(canvas.queryByRole('table', { name: 'Соперники' })).toBeNull();
  },
};

export const Arena: Story = {
  render: () => <Frame><ArenaStatsView stats={arenaFixture} /></Frame>,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('radio', { name: 'Лучшие' }));
    await expect(canvas.getByRole('table', { name: 'Забеги' })).toBeVisible();
  },
};

export const EmptyMode: Story = {
  render: () => <Frame><PlayerStatsEmpty filtered={false} /></Frame>,
  play: async ({ canvas }) => {
    await expect(canvas.getByText('В этом режиме пока нет игр')).toBeInTheDocument();
    await expect(canvas.queryByRole('link')).toBeNull();
  },
};
