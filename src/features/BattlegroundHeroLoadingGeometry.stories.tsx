import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import { BattlegroundHeroesRoute } from './Battlegrounds';
import { heroMotionApis, heroMotionDetail } from '../../tests/fixtures/battleground-hero-motion-data';

// A portrait with the real 256 × 272 hero art ratio, independent of static files.
const heroPortrait = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="256" height="272"%3E%3Crect width="256" height="272" fill="%23a0523d"/%3E%3C/svg%3E';
// Ready and loading states of the hero page in the same full-page shell, for
// tests/skeleton-geometry-browser.test.mjs. Loading stories leave every API
// request pending; the seeded story passes the server teaser as the page does.
const libraryHero = heroMotionDetail.libraryHero;
const teaser = {
  dbfId: 61490, name: 'Алекстраза', image: heroPortrait,
  heroPower: { name: libraryHero.hero_power.card.name, text: libraryHero.hero_power.card.text, image: libraryHero.hero_power.card.image },
};
// Production heroes have a two-line profile description and two external links (wiki, HSReplay).
const readyDetail = { ...heroMotionDetail, libraryHero: { ...libraryHero, dbf: 61488,
  images: { hero: teaser.image, full_art: teaser.image },
  character: { description: 'Королева драконов и Хранительница жизни, Алекстраза защищает Азерот вместе со своей стаей и ведёт драконов в бой за таверну.' } } };

function mockFetch(pending: boolean) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input), location.origin).pathname;
    if (!path.startsWith('/api/')) return originalFetch(input, init);
    if (pending) return new Promise<Response>(() => {});
    const body = path === '/api/bg/heroes/61488/details' ? readyDetail : heroMotionApis[path] ?? {};
    return Response.json(body);
  };
  return () => { globalThis.fetch = originalFetch; };
}

const meta = {
  title: 'Battlegrounds hero detail/Measured loading geometry',
  component: BattlegroundHeroesRoute,
  args: { path: '/heroes/61488', onNavigate: fn() },
  parameters: { layout: 'fullscreen', fullPage: true },
  decorators: [Story => <main className="arena-app-shell arena-app-battlegrounds" style={{ padding: 16 }}><Story /></main>],
  beforeEach: () => mockFetch(false),
} satisfies Meta<typeof BattlegroundHeroesRoute>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  play: async ({ canvas }) => { await canvas.findByRole('tablist', { name: 'Статистика героя' }); },
};

export const Loading: Story = {
  args: { path: '/heroes/61490' },
  beforeEach: () => mockFetch(true),
  play: async ({ canvas }) => { await expect(canvas.getByRole('status')).toHaveTextContent('Загружаем страницу героя'); },
};

export const LoadingFromTeaser: Story = {
  args: { path: '/heroes/61490', teaser },
  // The busy teaser is dimmed on purpose while statistics load; contrast is checked everywhere else.
  parameters: { a11y: { config: { rules: [{ id: 'color-contrast', selector: '*:not([aria-busy="true"] *)' }] } } },
  beforeEach: () => mockFetch(true),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 1, name: 'Алекстраза' })).toBeVisible();
    await expect(canvas.getByRole('status')).toHaveTextContent('Загружаем страницу героя');
  },
};
