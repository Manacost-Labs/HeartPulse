import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import { BattlegroundHeroesRoute } from './Battlegrounds';
import { heroMotionApis } from '../../tests/fixtures/battleground-hero-motion-data';

const meta = {
  title: 'Battlegrounds/Hero detail',
  component: BattlegroundHeroesRoute,
  args: { path: '/heroes/61488', onNavigate: fn() },
  // A full-page story gets the page shell of the section at the viewport width;
  // the others sit in the preview surface, which is at most 64rem wide.
  decorators: [(Story, { parameters }) => parameters.fullPage
    ? <main className="arena-app-shell arena-app-battlegrounds" style={{ padding: 16 }}><Story /></main>
    : <div className="arena-app-battlegrounds"><Story /></div>],
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

export const EmptyStatistics: Story = {
  args: { path: '/heroes/61489' },
  play: async ({ canvas }) => {
    await canvas.findByRole('tablist', { name: 'Статистика героя' });
    for (const name of ['Обзор', 'Сила героя', 'Таверна', 'Составы']) {
      await userEvent.click(canvas.getByRole('tab', { name }));
      await expect(canvas.getByRole('tabpanel')).toHaveTextContent('Для этого раздела пока нет статистики.');
    }
  },
};

// The three stories below have no play function and really navigate, so
// `tests/battleground-hero-motion-browser.test.mjs` can drive them itself. They
// are full pages: the test measures the layout at widths up to 1600 px.
function NavigableRoute({ path }: { path: string }) {
  const [current, setCurrent] = useState(path);
  return <BattlegroundHeroesRoute path={current} onNavigate={setCurrent} />;
}
const navigable = (path: string): Story => ({
  args: { path },
  parameters: { layout: 'fullscreen', fullPage: true },
  render: args => <NavigableRoute path={args.path} />,
});

export const NavigableDetail = navigable('/heroes/61488');
export const NavigableList = navigable('/heroes');
export const NavigableEmptyHero = navigable('/heroes/61489');
