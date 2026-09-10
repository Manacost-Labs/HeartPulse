import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import { BattlegroundHeroesRoute } from './Battlegrounds';
import { heroMotionApis } from '../../tests/fixtures/battleground-hero-motion-data';

const meta = {
  title: 'Battlegrounds/Hero detail',
  component: BattlegroundHeroesRoute,
  args: { path: '/heroes/61488', onNavigate: fn() },
  decorators: [Story => <div className="arena-app-battlegrounds"><Story /></div>],
  beforeEach: () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const path = new URL(String(input), location.origin).pathname;
      return path.startsWith('/api/')
        ? new Response(JSON.stringify(heroMotionApis[path] ?? {}), { headers: { 'Content-Type': 'application/json' } })
        : originalFetch(input, init);
    };
    return () => { globalThis.fetch = originalFetch; };
  },
} satisfies Meta<typeof BattlegroundHeroesRoute>;
export default meta;
type Story = StoryObj<typeof meta>;

export const BuddyPairAndCharts: Story = {
  play: async ({ canvas, args }) => {
    await canvas.findByRole('tablist', { name: 'Статистика героя' });
    await userEvent.click(canvas.getByRole('tab', { name: 'Таверна' }));
    await expect(canvas.getByRole('heading', { name: 'Когда улучшать таверну' })).toBeVisible();
    await userEvent.click(canvas.getByRole('tab', { name: 'Обзор' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Все герои' }));
    await expect(args.onNavigate).toHaveBeenCalledWith('/heroes');
  },
};
