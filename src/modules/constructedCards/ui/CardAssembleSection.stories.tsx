import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { CardAssembleSection } from './CardAssembleSection';
import pool from './cardAssemblePool.json';
import type { AssembleBase, AssembleCard, AssembleDonor, AssembleOption, AssemblePoolDonor, CardAssembleData } from '../model/cardAssemble';

type PoolRow = [id: string, dbf: number, name: string, cost: number, rarity: string, cardClass: string, trigger: string, effect: string];
const POOL = pool as PoolRow[];

/**
 * Illustrative fixture, not HSReplay numbers: the real card names and texts of 191 minions of
 * the pool, with a deterministic spread of offer, pick and win rates (the contract's field
 * shapes are those of tests/fixtures/card-assemble-contract-be044.json).
 */
function random(seed: string) {
  let state = [...seed].reduce((sum, char) => (Math.imul(sum, 31) + char.charCodeAt(0)) >>> 0, 7);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const round = (value: number) => Math.round(value * 10) / 10;
const cardOf = (row: PoolRow): AssembleCard => ({ cardId: row[0], dbfId: row[1], name: row[2], cost: row[3], rarity: row[4], cardClass: row[5] });

/** Pool rules of the contract: a class card offers its class and neutral donors, the neutral F3TCH3R every class. */
function candidatesOf(base: PoolRow, cardId: string): PoolRow[] {
  return POOL.filter(row => row !== base && (cardId !== 'BE_702' || row[5] === 'ROGUE' || row[5] === 'NEUTRAL'));
}

function donorPoolOf(base: PoolRow, cardId: string, withStats: Set<string>): AssemblePoolDonor[] {
  const pool = candidatesOf(base, cardId).map((row): AssemblePoolDonor => ({
    card: cardOf(row),
    hasStats: withStats.has(row[0]),
    options: [
      { half: 'effect', text: { locale: 'ru', trigger: base[6], effect: row[7] } },
      { half: 'trigger', text: { locale: 'ru', trigger: row[6], effect: base[7] } },
    ],
  }));
  return [...pool.filter(donor => donor.hasStats), ...pool.filter(donor => !donor.hasStats).sort((a, b) => a.card.name.localeCompare(b.card.name, 'ru'))];
}

function donorsOf(base: PoolRow, seed: string): AssembleDonor[] {
  const rnd = random(`${seed}:${base[0]}`);
  const others = candidatesOf(base, seed).sort(() => rnd() - 0.5).slice(0, 34);
  return others.map((row, index): AssembleDonor => {
    const effectPick = 25 + rnd() * 65;
    const baseWin = 47 + rnd() * 14;
    const options: AssembleOption[] = [
      { half: 'effect', text: { locale: 'ru', trigger: base[6], effect: row[7] }, pickRate: round(effectPick), winRate: round(baseWin + rnd() * 5), picks: Math.round(effectPick * 5), lowSample: effectPick < 12, undervalued: false },
      { half: 'trigger', text: { locale: 'ru', trigger: row[6], effect: base[7] }, pickRate: round((100 - effectPick) * 0.9), winRate: round(baseWin - 3 + rnd() * 6), picks: Math.round((100 - effectPick) * 4), lowSample: effectPick > 90, undervalued: false },
    ];
    const lowSample = index > 29;
    if (lowSample) options.forEach(option => { option.lowSample = true; option.picks = 3 + Math.round(rnd() * 6); });
    const rated = options.filter(option => !option.lowSample && option.winRate !== null);
    const mean = rated.reduce((sum, option) => sum + (option.winRate ?? 0), 0) / Math.max(1, rated.length);
    options.forEach(option => { option.undervalued = !option.lowSample && (option.winRate ?? 0) > mean + 2 && (option.pickRate ?? 100) < 40; });
    return { card: cardOf(row), offerRate: round(9 - index * 0.2), pickRate: round(effectPick), winRate: round(baseWin), picks: 400 - index * 9, lowSample, options };
  });
}

function assembleAnswer(cardId: string, basesCount: number, requested: string | null, withoutPool = false): CardAssembleData {
  const rnd = random(cardId);
  const rows = [POOL[1] as PoolRow, ...POOL.slice(2)].slice(0, basesCount);
  const bases: AssembleBase[] = rows.map((row, index) => {
    const offer = round(Math.max(0.2, (100 / (index + 6)) * 0.9 * (0.6 + rnd() * 0.8)));
    const lowSample = index > basesCount - 4;
    return { card: cardOf(row), offerRate: offer, winRate: lowSample ? null : round(46 + rnd() * 14), lowSample, donorsTotal: 34, donors: null };
  });
  bases.sort((a, b) => (b.offerRate ?? 0) - (a.offerRate ?? 0));
  const wanted = requested && requested !== 'top' ? bases.find(base => String(base.card.dbfId) === requested) : bases[0];
  const target = wanted ?? bases[0];
  const targetRow = target ? rows.find(row => row[1] === target.card.dbfId) : undefined;
  if (target && targetRow) {
    target.donors = donorsOf(targetRow, cardId);
    if (!withoutPool) target.donorPool = donorPoolOf(targetRow, cardId, new Set(target.donors.map(donor => donor.card.cardId)));
  }
  return {
    cardId, format: 'standard', state: 'ok', checkedAt: '2026-11-19T03:10:00+00:00', asOf: null, stale: false,
    sourceUrl: 'https://hsreplay.net/cards/assemble-pools/', timeRange: 'LAST_7_DAYS', originalClassOnly: true,
    basesTotal: bases.length, winRate: 51.2, bases,
    donorPoolStatus: { state: withoutPool ? 'mismatch' : 'ok', classDependent: cardId === 'BE_044', playerClass: cardId === 'BE_702' ? 'ROGUE' : null },
  };
}

const BASES: Record<string, number> = { BE_044: 38, BE_004: 26, BE_702: 165 };

const meta = {
  title: 'Card detail/Assemble',
  component: CardAssembleSection,
  parameters: { layout: 'fullscreen' },
  args: { format: 'standard', cardId: 'BE_044' },
  decorators: [Story => <div className="constructed-cards constructed-card-detail" style={{ maxWidth: 1320, marginInline: 'auto', padding: 16 }}><Story /></div>],
  beforeEach: ({ parameters, args }) => {
    const original = window.fetch;
    let failed = false;
    window.fetch = async (input, init) => {
      const url = new URL(String(input), window.location.origin);
      if (!url.pathname.startsWith('/api/card-assemble/')) return original(input, init);
      if (parameters.hold) return new Promise<Response>(() => {});
      if (parameters.missing) return new Response('{}', { status: 404 });
      if (parameters.failOnce && !failed) { failed = true; return new Response('{}', { status: 503 }); }
      const answer = parameters.notCollected
        ? { ...assembleAnswer(args.cardId, 0, null), state: 'not_collected' }
        : parameters.empty
        ? { ...assembleAnswer(args.cardId, 0, null), state: 'no_data' }
        : assembleAnswer(args.cardId, BASES[args.cardId] ?? 38, url.searchParams.get('base'), parameters.noPool === true);
      return new Response(JSON.stringify(answer), { headers: { 'Content-Type': 'application/json' } });
    };
    return () => { window.fetch = original; };
  },
} satisfies Meta<typeof CardAssembleSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const F3tch3r: Story = {};
export const Raj: Story = { args: { cardId: 'BE_004' } };
/** 165 bases: the ribbon shows the first 24 and a search field. */
export const ShadowCreator: Story = { args: { cardId: 'BE_702' } };
export const Loading: Story = { parameters: { hold: true } };
export const NotEnoughData: Story = { parameters: { empty: true } };
/** The first request fails with a 503: an alert with «Повторить»; the second answer is fine. */
export const ErrorThenRetry: Story = { parameters: { failOnce: true } };
/** The source does not track the card yet: no section at all. */
export const NotCollected: Story = { parameters: { notCollected: true } };
/** A phone: two rows of portraits, the builds right under the slots. */
export const Phone: Story = { globals: { viewport: { value: 'mobile1', isRotated: false } } };
export const Missing: Story = { parameters: { missing: true } };

/** «Мне предложили»: two donors give four builds, the best one glows. */
export const Offered: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Мне предложили' }));
    const list = await canvas.findByRole('list', { name: 'Существа, которых могла предложить игра' });
    const buttons = within(list).getAllByRole('button');
    await userEvent.click(buttons[0] as HTMLElement);
    await userEvent.click(buttons[1] as HTMLElement);
    await waitFor(() => expect(canvas.getByText('Лучший выбор')).toBeVisible());
  },
};

/** The check of the pool failed: «Мне предложили» works on the donors with statistics, no class choice. */
export const PoolMismatch: Story = { parameters: { noPool: true } };

/** F3TCH3R, class Mage: one donor with statistics and one that never met the base; the best build is among the first. */
export const OfferedDonorWithoutStats: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Маг' }));
    await userEvent.click(await canvas.findByRole('button', { name: 'Мне предложили' }));
    const list = await canvas.findByRole('list', { name: 'Существа, которых могла предложить игра' });
    await userEvent.click(within(list).getAllByRole('button')[0] as HTMLElement);
    await userEvent.click(await canvas.findByRole('button', { name: /Показать всех/ }));
    const all = within(await canvas.findByRole('list', { name: 'Существа, которых могла предложить игра' })).getAllByRole('button');
    await userEvent.click(all[all.length - 1] as HTMLElement);
    await waitFor(() => expect(canvas.getByText('Лучший выбор')).toBeVisible());
  },
};
