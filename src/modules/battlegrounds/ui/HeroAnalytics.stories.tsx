import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { HeroCompositionAnalytics, HeroOverview, HeroPowerAnalytics, HeroTavernAnalytics } from './HeroAnalytics';
import '../../../shared/ui/analytics/Analytics.css';
import './HeroAnalytics.css';
import real from './analyticsSnapshot.json';
import alexstrasza from './heroDetailSnapshot.json';

const { stats: heroDetailStats, cards: heroDetailCards } = alexstrasza;

const meta = {
  title: 'Battlegrounds/Analytics',
  component: HeroOverview,
  decorators: [Story => <div style={{ padding: 16 }}><Story /></div>],
  args: { placement: ['16.66%', '16.60%', '13.15%', '10.83%', '10.09%', '9.36%', '10.22%', '13.10%'], combat: heroDetailStats.combat_winrate },
} satisfies Meta<typeof HeroOverview>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Alexstrasza, solo, top 50%, from the BG service on 21 Oct 2026. */
export const Overview: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { name: 'Места в партиях' })).toBeVisible();
    await expect(canvas.getByRole('heading', { name: 'Винрейт боёв по раундам' })).toBeVisible();
  },
};
export const HeroPower: Story = { render: () => <HeroPowerAnalytics byTurn={heroDetailStats.hero_power_by_turn} byTier={heroDetailStats.hero_power} /> };
export const Tavern: Story = { render: () => <HeroTavernAnalytics byTurn={heroDetailStats.tavern_up_by_turn} distribution={heroDetailStats.tavern_up} /> };
export const Compositions: Story = {
  render: () => <HeroCompositionAnalytics best={heroDetailStats.best_composition} compositions={heroDetailStats.compositions} cards={heroDetailCards} />,
  play: async ({ canvas }) => {
    // The most played composition comes first; the API order puts a 45-game sample on top.
    const rows = canvas.getAllByRole('row').slice(1);
    await expect(rows[0]).toHaveTextContent('Драконы');
    await expect(canvas.getAllByRole('img', { name: /Меньше 100 игр/ }).length).toBeGreaterThan(0);
  },
};

/** Lord Jaraxxus from the HSReplay mirror on 21 Oct 2026. */
export const RealTavernDistribution: Story = { render: () => <HeroTavernAnalytics byTurn={[]} distribution={real.hero.tavern_up} /> };
export const RealHeroPowerByTurn: Story = { render: () => <HeroPowerAnalytics byTurn={real.hero.hero_power_by_turn} byTier={[]} /> };
