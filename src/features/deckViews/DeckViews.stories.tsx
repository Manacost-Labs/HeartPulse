import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';
import ConstructedArchetypeDeckGallery from '../ConstructedArchetypeDeckGallery';
import { ConstructedCardDecks } from '../StandardCardDetail';
import fixture from '../funDecks/funDeckLayouts.fixture.json';

/**
 * The shared deck views outside the fun-decks page: the builds of an
 * archetype (also the Vicious Gold report) and the decks with a card. The deck
 * lists are real ones from the fixture: Mech Rogue with a built Zilliax and
 * the E.T.C. band, a 40-card Questline Shaman and a Standard Rainbow DK.
 */
const resolved = fixture.resolved as Record<string, Record<string, unknown>>;
const [mechRogue, questline, rainbow] = fixture.funDecks.decks;

function SiteDeckViews() {
  return <main style={{ display: 'grid', gap: 24 }}>
    <section className="archetype-builds" aria-label="Сборки архетипа">
      <ConstructedArchetypeDeckGallery format="wild" archetype="Mech Rogue" archetypeLabel="Мех-разбойник" classKey="rogue"
        builds={[mechRogue, questline].map((deck, index) => ({ deckCode: deck.deckCode, games: 1200 - index * 300, winrate: 53.4 - index * 6,
          sourceUrl: '', updatedAt: null, sampleRank: 'diamond_legend', samplePeriod: 'last_week' }))} />
    </section>
    <ConstructedCardDecks format="standard" decks={[rainbow, mechRogue].map((deck, index) => ({
      id: `deck-${index}`, title: deck.title, archetypeLabel: deck.title, className: deck.className, deckCode: deck.deckCode, winrate: deck.winRate,
    }))} />
  </main>;
}

const meta = {
  title: 'Constructed/Deck views across the site',
  component: SiteDeckViews,
  parameters: { layout: 'fullscreen', fullPage: true },
  decorators: [Story => <div style={{ maxWidth: 1200, marginInline: 'auto', paddingInline: 'clamp(.8rem, 2vw, 1.5rem)' }}><Story /></div>],
  beforeEach: () => {
    const original = window.fetch;
    try { window.localStorage.removeItem('hp:deck-layout'); } catch { /* storage may be blocked */ }
    window.fetch = (input, init) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname === '/api/deck/resolve') {
        const deck = resolved[url.searchParams.get('code') ?? ''];
        return Promise.resolve(deck ? Response.json({ ok: true, ...deck }) : Response.json({ error: 'Нет колоды' }, { status: 404 }));
      }
      return original(input, init);
    };
    return () => { window.fetch = original; };
  },
} satisfies Meta<typeof SiteDeckViews>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Tiles: Story = {
  play: async ({ canvas }) => {
    const switches = await canvas.findAllByRole('group', { name: 'Вид колод' });
    await expect(switches).toHaveLength(2);
    await expect(await canvas.findAllByRole('link', { name: '4 маны · Зиллиакс Делюкс 3000' })).toHaveLength(2);
  },
};

export const Rows: Story = {
  play: async ({ canvas }) => {
    // One switch changes every deck list of the page.
    await userEvent.click((await canvas.findAllByRole('button', { name: 'Строки' }))[0]);
    await expect(await canvas.findAllByRole('img', { name: /^Кривая маны/ })).toHaveLength(4);
  },
};
