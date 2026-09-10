import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor } from 'storybook/test';
import { BattlegroundHeroCard } from './BattlegroundHeroCard';
import './Battlegrounds.css';
import '../battlegrounds-parchment.css';

const meta = {
  title: 'Battlegrounds/Hero card',
  component: BattlegroundHeroCard,
  args: {
    hero: { name: 'Алекстраза', image: '/bg-legacy/heroes_bg/Alexstrasza.png', dbfId: 61488, averagePlace: '4,2', popularity: '12%', heroPower: { name: 'Королева драконов', image: '/bg-legacy/heroes_bg/Alexstrasza.png' } },
    tier: 'A', onNavigate: fn(),
  },
  decorators: [Story => <div className="arena-app-battlegrounds bg-heroes-page" style={{ width: 240 }}><Story /></div>],
} satisfies Meta<typeof BattlegroundHeroCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const GentlePowerReveal: Story = {
  play: async ({ canvas, args }) => {
    const card = canvas.getByRole('link');
    const preview = canvas.getByAltText('Сила героя: Королева драконов').parentElement;
    if (!preview) throw new Error('Hero power preview must be rendered');
    await userEvent.tab();
    await expect(card).toHaveFocus();
    await waitFor(() => expect(getComputedStyle(preview).opacity).toBe('1'));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(getComputedStyle(preview).opacity).toBe('0'));
    await userEvent.click(card);
    await expect(args.onNavigate).toHaveBeenCalledWith('/heroes/61488');
  },
};

export const WithoutPower: Story = {
  args: { hero: { ...meta.args.hero, heroPower: null } },
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole('link'));
    await expect(args.onNavigate).toHaveBeenCalledWith('/heroes/61488');
  },
};
