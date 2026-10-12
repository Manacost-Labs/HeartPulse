import type { Meta, StoryObj } from '@storybook/react-vite';
import { RoundAnalytics } from './RoundAnalytics';
import '../../../shared/ui/analytics/Analytics.css';

const meta = { title: 'Battlegrounds/Round Analytics', component: RoundAnalytics, args: { rows: [1, 2, 3, 4, 9, 10, 11, 12, 13, 14, 15, 16].map((round, index) => ({ combat_round: round, impact: -0.29 + index * 0.04, combat_winrate: 31.2 + index * 3, avg_placement_with: 4.63 - index * 0.28, games_with_minion: 5583 - index * 450, wins: 804 - index * 60, losses: 1772 - index * 130 })) } } satisfies Meta<typeof RoundAnalytics>;
export default meta;
type Story = StoryObj<typeof meta>;
export const RoundsWithGaps: Story = {};
export const Empty: Story = { args: { rows: [] } };
