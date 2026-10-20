import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';
import ConstructedArchetypeDeckGallery from './ConstructedArchetypeDeckGallery';
import './ConstructedArchetypes.css';

const builds = Array.from({ length: 3 }, (_, index) => ({
  deckCode: `AAEBAa0GStoryGalleryDeck${index + 1}`,
  games: 2_216 - index * 91,
  winrate: 57.1 + index,
  sourceUrl: 'https://www.hsguru.com/deck/40919030',
  updatedAt: '2026-07-24T12:38:57.727Z',
  sampleRank: 'all',
  samplePeriod: 'past_30_days',
}));

// Deck renders and deck lists stay pending: every card shows its square
// placeholder while the gallery holds the one loading status.
const meta = {
  title: 'Archetype detail/Build gallery',
  component: ConstructedArchetypeDeckGallery,
  parameters: { layout: 'fullscreen' },
  args: { builds, format: 'standard', archetype: 'Thief Priest', classKey: 'priest' },
  decorators: [Story => <div className="archetypes-page archetype-detail-page" style={{ maxWidth: 1092, marginInline: 'auto' }}><section className="archetype-builds"><Story /></section></div>],
  beforeEach: () => {
    const original = globalThis.fetch;
    globalThis.fetch = (input, init) => /\/api\/deck\/(render|resolve)/.test(String(input))
      ? new Promise<Response>(() => {})
      : original(input, init);
    return () => { globalThis.fetch = original; };
  },
} satisfies Meta<typeof ConstructedArchetypeDeckGallery>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  play: async ({ canvas, canvasElement }) => {
    await waitFor(() => expect(canvas.getAllByRole('status')).toHaveLength(1));
    await expect(canvas.getByRole('status')).toHaveTextContent('Загружаем сборки');
    await expect(canvasElement.querySelector('[aria-busy="true"]')).toBeNull();
    await expect(canvasElement.querySelectorAll('.deck-render-preview__loading')).toHaveLength(builds.length);
    await expect(canvasElement.querySelector('.archetype-deck-gallery > [role="status"]')).toBeNull();
  },
};
