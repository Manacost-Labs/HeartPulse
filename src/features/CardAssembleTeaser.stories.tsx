import type { Meta, StoryObj } from '@storybook/react-vite';
import { CardAssembleTeaser } from './CardAssembleTeaser';
import type { CardAssembleData } from '../modules/constructedCards/public/index';

type Base = CardAssembleData['bases'][number];
const base = (cardId: string, name: string, winRate: number, lowSample = false): Base => ({
  card: { cardId, dbfId: 1, name, cost: 3, cardClass: 'NEUTRAL', rarity: 'COMMON' }, offerRate: 7, winRate, lowSample, donorsTotal: 30, donors: null,
});
/** Illustrative fixture (not HSReplay numbers): 38 bases, the best real sample is «Лунный дракон». */
const answer = (cardId: string, format: CardAssembleData['format']): CardAssembleData => ({
  cardId, format, state: 'ok', checkedAt: '2026-11-19T03:10:00+00:00', asOf: null, stale: false, sourceUrl: 'https://hsreplay.net/cards/assemble-pools/',
  timeRange: 'LAST_7_DAYS', originalClassOnly: true, basesTotal: 38, winRate: 51.2,
  bases: [base('A', 'Смотритель песочных часов', 47), base('B', 'Лунный дракон', 61.6), base('C', 'Редкий гость', 70, true)],
});

const meta = {
  title: 'Card detail/Assemble teaser',
  component: CardAssembleTeaser,
  parameters: { layout: 'fullscreen' },
  args: { format: 'standard', cardId: 'BE_044' },
  decorators: [Story => <div className="constructed-cards constructed-card-detail" style={{ maxWidth: 1320, marginInline: 'auto', padding: 16 }}><Story /></div>],
  beforeEach: ({ parameters, args }) => {
    const original = window.fetch;
    let failed = false;
    window.fetch = async (input, init) => {
      const url = new URL(String(input), window.location.origin);
      if (!url.pathname.startsWith('/api/card-assemble/')) return original(input, init);
      // The figures arrive a moment later, so the reserved place can be checked.
      await new Promise(resolve => setTimeout(resolve, 150));
      if (parameters.missing) return new Response('{}', { status: 404 });
      if (parameters.failOnce && !failed) { failed = true; return new Response('{}', { status: 503 }); }
      return new Response(JSON.stringify(answer(args.cardId, args.format)), { headers: { 'Content-Type': 'application/json' } });
    };
    return () => { window.fetch = original; };
  },
} satisfies Meta<typeof CardAssembleTeaser>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The card page's block: the pool, the best base and the button to the tool. */
export const Default: Story = {};
export const Wild: Story = { args: { format: 'wild' } };
/** The request fails: the button stays, no message, no figures. */
export const Failed: Story = { parameters: { failOnce: true } };
export const Missing: Story = { parameters: { missing: true } };
export const Phone: Story = { globals: { viewport: { value: 'mobile1', isRotated: false } } };
