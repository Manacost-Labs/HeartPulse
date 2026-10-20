import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import { BattlegroundHeroesRoute } from './Battlegrounds';
import { heroMotionApis, heroMotionDetail } from '../../tests/fixtures/battleground-hero-motion-data';

// A portrait with the real 256 × 272 hero art ratio, independent of static files.
const heroPortrait = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="256" height="272"%3E%3Crect width="256" height="272" fill="%23a0523d"/%3E%3C/svg%3E';
// Ready and loading states of the hero rating, for
// tests/skeleton-geometry-browser.test.mjs: two tiers of six heroes, as the
// skeleton reserves. `ShortText` uses one-line names, `Ready` long two-line ones.
function heroes(name: (index: number) => string) {
  return Array.from({ length: 12 }, (_, index) => ({
    ...heroMotionDetail.stats.hero, dbfId: 70000 + index, hero: name(index), image: heroPortrait,
    tier: index < 6 ? 'A' : 'B', avg_placement: 3.9 + index / 10, pick_rate: `${12 - index}%`,
  }));
}

function mockFetch(mode: 'long' | 'short' | 'pending') {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input), location.origin).pathname;
    if (path === '/bg-legacy/hero-tiers-data.js') return new Response('window.heroTierStatic = {};');
    if (!path.startsWith('/api/')) return originalFetch(input, init);
    if (mode === 'pending') return new Promise<Response>(() => {});
    if (path === '/api/bg/heroes') {
      const name = mode === 'long' ? (index: number) => `Повелительница драконов Алекстраза ${index + 1}` : (index: number) => `Герой ${index + 1}`;
      return Response.json({ ok: true, fetched_at: '2026-09-22T12:00:00Z', view: { heroes: heroes(name) } });
    }
    return Response.json(heroMotionApis[path] ?? {});
  };
  return () => { globalThis.fetch = originalFetch; };
}

const meta = {
  title: 'Battlegrounds heroes/Measured loading geometry',
  component: BattlegroundHeroesRoute,
  args: { path: '/heroes', onNavigate: fn() },
  parameters: { layout: 'fullscreen', fullPage: true },
  decorators: [Story => <main className="arena-app-shell arena-app-battlegrounds" style={{ padding: 16 }}><Story /></main>],
} satisfies Meta<typeof BattlegroundHeroesRoute>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  beforeEach: () => mockFetch('long'),
  play: async ({ canvas }) => { await canvas.findAllByRole('link', { name: /Повелительница драконов/ }); },
};

export const ShortText: Story = {
  beforeEach: () => mockFetch('short'),
  play: async ({ canvas }) => { await canvas.findAllByRole('link', { name: /Герой 1/ }); },
};

export const Loading: Story = {
  beforeEach: () => mockFetch('pending'),
  play: async ({ canvas }) => { await expect(canvas.getByRole('status')).toHaveTextContent('Загружаем героев'); },
};
