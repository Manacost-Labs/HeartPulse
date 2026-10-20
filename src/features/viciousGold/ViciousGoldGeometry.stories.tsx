import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import ViciousSyndicateGold from '../ViciousSyndicateGold';
import { ViciousGoldBanner, ViciousGoldLoading } from './ViciousGoldBanner';
import { summary, builds } from '../../../tests/fixtures/viciousGoldPayload.mjs';

// Paired states for tests/skeleton-geometry-browser.test.mjs: the loaded
// dashboard and the loading frame the page shows under the same banner.
// Compare `.vsgold__classes`, `.vsgold__decks`, `.vsgold__deck-row`,
// `.vsgold__power-heading` and `.vsgold__tier-card` between the stories.

const meta = {
  title: 'Vicious Gold/Measured loading geometry',
  component: ViciousSyndicateGold,
  parameters: { layout: 'fullscreen' },
  beforeEach: () => {
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const path = new URL(String(input), location.origin).pathname;
      if (path.startsWith('/api/vicious-syndicate-gold')) return new Response(JSON.stringify(path.endsWith('/builds') ? builds : summary), { headers: { 'Content-Type': 'application/json' } });
      return original(input, init);
    };
    return () => { globalThis.fetch = original; };
  },
} satisfies Meta<typeof ViciousSyndicateGold>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('heading', { name: 'Power Tier List' })).toBeVisible();
  },
};

/** The page's loading frame (ViciousGoldPageClient and ViciousSyndicateGold render the same one). */
export const Loading: Story = {
  render: () => <section className="vsgold space-y-5 sm:space-y-6"><ViciousGoldBanner /><ViciousGoldLoading /></section>,
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getAllByRole('status')).toHaveLength(1);
    await expect(canvas.getByRole('status')).toHaveTextContent('Загружаем Vicious Syndicate Gold');
    await expect(canvasElement.querySelector('[aria-busy="true"]')).toBeNull();
    await expect(canvas.getAllByRole('heading')).toHaveLength(1);
    // The class chart's real frame sizes its header; it is inert and hidden, so nothing in the frame is reachable.
    await expect(canvas.queryAllByRole('button')).toHaveLength(0);
    await expect(canvas.queryAllByRole('link')).toHaveLength(0);
    await expect(canvasElement.querySelector('.vsgold__loading [inert]')).not.toBeNull();
  },
};
