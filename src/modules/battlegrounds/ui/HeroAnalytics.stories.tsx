import type { Meta, StoryObj } from '@storybook/react-vite';
import { HeroPowerChart, HeroTavernChart, HeroCompositionAnalytics } from './HeroAnalytics';
import '../../../shared/ui/analytics/Analytics.css';

const meta = { title: 'Battlegrounds/Analytics', component: HeroPowerChart, args: { rows: Array.from({ length: 17 }, (_, index) => ({ turn: index + 1, invoked_rate: index < 5 ? 0 : (index - 4) * 0.46, total_data_points: 2342 - index * 130 })) } } satisfies Meta<typeof HeroPowerChart>;
export default meta;
type Story = StoryObj<typeof meta>;
export const HeroPower: Story = {};
export const EmptyPower: Story = { args: { rows: [] } };
export const TavernDistribution: Story = { render: () => <HeroTavernChart rows={Array.from({ length: 16 }, (_, index) => ({ turn: index + 1, tavern_tier: Math.min(6, Math.ceil((index + 1) / 2)), popularity: 80 })).concat(Array.from({ length: 16 }, (_, index) => ({ turn: index + 1, tavern_tier: Math.min(7, Math.ceil((index + 1) / 2) + 1), popularity: 20 })))} /> };
export const Compositions: Story = { render: () => <HeroCompositionAnalytics rows={['Демоны', 'Мурлоки', 'Элементали', 'Звери', 'Драконы', 'Свинобразы', 'Aberrations', 'Механизмы'].map((name, index) => ({ name, popularity: index === 0 ? 92.41 : 1.06, avg_placement: 3.64 + index * 0.12, popularity_top_4: index === 0 ? 94.11 : 0.79, num_games: index === 0 ? 9376 : 108 }))} /> };
