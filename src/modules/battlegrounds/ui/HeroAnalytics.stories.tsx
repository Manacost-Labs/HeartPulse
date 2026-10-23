import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
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
  play: async ({ canvas, canvasElement }) => {
    // The most played composition comes first; the API order puts a 45-game sample on top.
    const rows = canvas.getAllByRole('row').slice(1);
    await expect(rows[0]).toHaveTextContent('Драконы');
    await expect(canvas.getAllByRole('img', { name: /Меньше 100 игр/ }).length).toBeGreaterThan(0);
    // One presentation for the whole board: full cards only, one marker per golden minion.
    const lineup = canvasElement.querySelector<HTMLElement>('.bg-hero-lineup') ?? canvasElement;
    const golden = heroDetailStats.best_composition.lineup.filter(minion => minion.premium).length;
    await expect(within(lineup).getAllByRole('img', { name: 'Золотое' })).toHaveLength(golden);
    for (const image of lineup.querySelectorAll('img')) await expect(image.getAttribute('src')).not.toMatch(/framed|_G\.png/);
    // Final-board minions carry the Russian names the server adds from the card library.
    const names = [...canvasElement.querySelectorAll('.bg-hero-final .bg-hero-card-name')].map(name => name.textContent ?? '');
    await expect(names.filter(name => /[A-Za-z]/.test(name))).toEqual([]);
    // The card preview opens beside the name, outside the page flow.
    const trigger = canvasElement.querySelector<HTMLElement>('.bg-hero-final .bg-hero-card-name') ?? canvasElement;
    await userEvent.hover(trigger);
    await waitFor(() => expect(document.querySelector('[role="tooltip"].anchored-image-preview')).toHaveAttribute('aria-label', `Полная карта ${names[0]}`));
    await userEvent.unhover(trigger);
  },
};

/** Lord Jaraxxus from the HSReplay mirror on 21 Oct 2026. */
export const RealTavernDistribution: Story = { render: () => <HeroTavernAnalytics byTurn={[]} distribution={real.hero.tavern_up} /> };
export const RealHeroPowerByTurn: Story = { render: () => <HeroPowerAnalytics byTurn={real.hero.hero_power_by_turn} byTier={[]} /> };
