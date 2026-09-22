import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import { BattlegroundHeroesRoute } from './Battlegrounds';
import { heroMotionApis } from '../../tests/fixtures/battleground-hero-motion-data';

const meta = {
  title: 'Battlegrounds/Hero tier list', component: BattlegroundHeroesRoute,
  args: { path: '/heroes', onNavigate: fn() },
  decorators: [Story => <div className="arena-app-battlegrounds"><Story /></div>],
  beforeEach: () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const path = new URL(String(input), location.origin).pathname;
      if (path === '/bg-legacy/hero-tiers-data.js') return new Response('window.heroTierStatic = {};');
      return path.startsWith('/api/')
        ? Response.json(heroMotionApis[path] ?? {})
        : originalFetch(input, init);
    };
    return () => { globalThis.fetch = originalFetch; };
  },
} satisfies Meta<typeof BattlegroundHeroesRoute>;
export default meta;
type Story = StoryObj<typeof meta>;

export const LiveRankings: Story = {
  play: async ({ canvas, args }) => {
    const hero = await canvas.findByRole('link', { name: /Алекстраза/ });
    await expect(canvas.getByText(/HSReplay · Соло/)).toBeVisible();
    await userEvent.click(hero);
    await expect(args.onNavigate).toHaveBeenCalledWith('/heroes/61488');
  },
};
