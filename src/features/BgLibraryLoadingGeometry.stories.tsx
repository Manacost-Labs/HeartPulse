import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import BgLibrary from './BgLibrary';

// Ready and loading states of a Battlegrounds card page in the same shell,
// for tests/skeleton-geometry-browser.test.mjs. Loading stories leave every
// request pending; the seeded story passes the server teaser as the page does.
const cardArt = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="512" height="775"%3E%3Crect width="512" height="775" fill="%23b98536"/%3E%3C/svg%3E';
const text = 'В конце вашего хода другие ваши существа получают +1/+1.';
const card = {
  card_id: 'BG36_110', dbf: 131718, name: { ru: 'Счастье', en: 'Joyous' }, text: { ru: text },
  creature_type: { slug: 'aberration', name_ru: 'Аберрация' }, card_type: { slug: 'minion' },
  attack: 2, health: 3, tavern_tier: 4, in_pool: true, mechanics: [], images: { card: cardArt }, artist: 'Konstantin Turovec',
};
const minion = { dbfId: 131718, impact: 0.42, popularity: 0.18, avg_placement_with: 3.91, avg_placement_without: 4.3, rounds: [] };
const teaser = { dbfId: 131718, name: 'Счастье', typeName: 'Существо', text, image: cardArt };

function mockFetch(pending: boolean) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input), location.origin).pathname;
    if (pending) return new Promise<Response>(() => {});
    if (path === '/api/bg/library/cards/by-dbf/131718') return Response.json(card);
    if (path === '/api/bg/library/cards') return Response.json({ data: [card] });
    if (path === '/api/bg/library/minions/131718') return Response.json(minion);
    if (path === '/bg-legacy/comps-data.js') return new Response('');
    return originalFetch(input, init);
  };
  return () => { globalThis.fetch = originalFetch; };
}

const meta = {
  title: 'Battlegrounds card detail/Measured loading geometry',
  component: BgLibrary,
  args: { currentPath: '/library/minions/счастье-131718/', navigatePath: fn() },
  parameters: { layout: 'fullscreen', fullPage: true },
  decorators: [Story => <main className="arena-app-shell arena-app-battlegrounds" style={{ padding: 16 }}><Story /></main>],
} satisfies Meta<typeof BgLibrary>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  beforeEach: () => mockFetch(false),
  play: async ({ canvas }) => { await canvas.findByRole('heading', { level: 1, name: 'Счастье' }); },
};

export const Loading: Story = {
  beforeEach: () => mockFetch(true),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Загружаем страницу карты');
    await expect(canvas.queryByRole('heading')).not.toBeInTheDocument();
  },
};

export const LoadingFromTeaser: Story = {
  args: { teaser },
  // The busy teaser is dimmed on purpose while statistics load; contrast is checked everywhere else.
  parameters: { a11y: { config: { rules: [{ id: 'color-contrast', selector: '*:not([aria-busy="true"] *)' }] } } },
  beforeEach: () => mockFetch(true),
  play: async ({ canvas }) => {
    const heading = canvas.getByRole('heading', { level: 1, name: 'Счастье' });
    await expect(heading.closest('[aria-busy="true"]')).toHaveClass('data-surface');
    await expect(canvas.getByRole('status').closest('[aria-busy="true"]')).toBeNull();
  },
};
