import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { expect, userEvent } from 'storybook/test';
import type { BattlegroundsStats } from '../../modules/playerStats/public';
import { ArenaStatsView } from './ArenaStatsView';
import { BattlegroundsStatsView } from './BattlegroundsStatsView';
import { ConstructedStatsView } from './ConstructedStatsView';
import { PlayerStatsEmpty } from './PlayerStatsEmpty';
import { arenaFixture, battlegroundsFixture, standardFixture } from './playerStatsFixtures';
import '../../vendor/varylo-ui/styles/index.css';
import '../../shared/ui/varyloParchment.css';
import './PlayerStatsPanel.css';

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
  return <div className="player-stats-panel hp-varylo-parchment"><div className="player-stats-mode">{children}</div></div>;
}

const meta = {
  title: 'Features/Player Stats',
  parameters: { layout: 'padded', backgrounds: { default: 'parchment' } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Battlegrounds: Story = {
  render: () => <Frame><BattlegroundsStatsView stats={battlegroundsFixture} mmr="TOP_50_PERCENT" onMmrChange={() => {}} /></Frame>,
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Лучший рейтинг')).toBeVisible();
    await expect(canvas.getByText(/открывает/)).toBeVisible();
    await expect(canvas.getByRole('table', { name: 'Герои' })).toBeVisible();
  },
};

export const BattlegroundsVsGlobal: Story = {
  render: () => <Frame><BattlegroundsStatsView stats={withGlobal} mmr="TOP_20_PERCENT" onMmrChange={() => {}} /></Frame>,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('radiogroup', { name: 'Сравнивать с игроками' })).toBeVisible();
    await expect(canvas.queryByText(/открывает/)).toBeNull();
  },
};

export const RatingHover: Story = {
  render: () => <Frame><BattlegroundsStatsView stats={battlegroundsFixture} mmr="TOP_50_PERCENT" onMmrChange={() => {}} /></Frame>,
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
  render: () => <Frame><ConstructedStatsView stats={standardFixture} /></Frame>,
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Ранг сейчас')).toBeVisible();
    await expect(canvas.getByRole('table', { name: 'Колоды' })).toBeVisible();
  },
};

export const Arena: Story = {
  render: () => <Frame><ArenaStatsView stats={arenaFixture} /></Frame>,
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Средние победы', { selector: '.ui-kpi-group__label' })).toBeVisible();
    await userEvent.click(canvas.getByRole('radio', { name: 'Лучшие' }));
    await expect(canvas.getByRole('table', { name: 'Забеги' })).toBeVisible();
  },
};

export const Empty: Story = {
  render: () => <Frame><PlayerStatsEmpty filtered={false} /></Frame>,
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Установите Hearthpulse и войдите, чтобы игры появились здесь.')).toBeInTheDocument();
    await expect(canvas.getByRole('link', { name: 'Скачать Hearthpulse' })).toHaveAttribute('href', 'https://github.com/Zulut30/IceCrowV2/releases');
  },
};
