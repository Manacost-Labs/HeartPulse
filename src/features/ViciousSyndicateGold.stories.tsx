import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import ViciousSyndicateGold from './ViciousSyndicateGold';
import { summary, builds } from '../../tests/fixtures/viciousGoldPayload.mjs';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const meta = {
  title: 'Meta/Vicious Gold Analytics', component: ViciousSyndicateGold,
  args: { hasFullAccess: true },
  parameters: { layout: 'fullscreen', buildsAvailable: true },
  beforeEach: ({ parameters }) => {
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const path = new URL(String(input), location.origin).pathname;
      if (path === '/api/vicious-syndicate-gold/builds') {
        return parameters.buildsAvailable ? json(builds) : json({ error: 'Сборки Vicious Syndicate временно недоступны' }, 502);
      }
      if (path === '/api/vicious-syndicate-gold') return json(summary);
      return original(input, init);
    };
    return () => { globalThis.fetch = original; };
  },
} satisfies Meta<typeof ViciousSyndicateGold>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The report: plate with KPIs, Power Tier S–D, stacked class share bars and the deck list with builds. */
export const Report: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('heading', { name: 'Мета за последние 24 часа' })).toBeVisible();
    await expect(await canvas.findAllByRole('button', { name: /^Скопировать код колоды/ })).not.toHaveLength(0);
  },
};

/** The builds request failed: the statistics stay and no deck shows a build action or a note. */
export const BuildsUnavailable: Story = {
  parameters: { buildsAvailable: false },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('heading', { name: 'Power Tier List' })).toBeVisible();
    await expect(canvas.queryAllByRole('button', { name: /^Скопировать код колоды/ })).toHaveLength(0);
    await expect(canvas.queryByText(/Сборка обновляется/)).toBeNull();
  },
};

/** Phone width: rows in two lines, rank tabs scroll in their own row, no page overflow. */
export const Phone: Story = {
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  parameters: { viewport: { defaultViewport: 'mobile2' } },
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole('heading', { name: 'Power Tier List' });
    await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(canvasElement.ownerDocument.documentElement.clientWidth + 1);
  },
};

/** A guest (#656): the same report on the open frame, a lock in the place of every paid value, no paid request. */
export const GuestFrame: Story = {
  args: {
    hasFullAccess: false,
    open: {
      title: 'Vicious Syndicate Gold', format: 'Standard', source: 'Vicious Syndicate Live',
      sourceUrl: 'https://www.vicioussyndicate.com/data-reaper-live/', updatedAt: summary.updatedAt,
      timeRanges: { distribution: 'lastDay', tierLadder: 'lastDay', tierMatchups: null },
      classes: [
        { class: 'Warrior', classLabel: 'Воин', classIcon: 'warrior' },
        { class: 'Mage', classLabel: 'Маг', classIcon: 'mage' },
      ],
      archetypes: [
        { class: 'Warrior', classLabel: 'Воин', classIcon: 'warrior', deck: 'Dragon Warrior', deckLabel: 'Драконий Воин', archetypeSlug: null },
        { class: 'Mage', classLabel: 'Маг', classIcon: 'mage', deck: 'Protoss Mage', deckLabel: 'Протосс Маг', archetypeSlug: null },
      ],
      rankBrackets: [{ rankBracket: 'All ranks', rankLabel: 'Все ранги' }, { rankBracket: 'Legend', rankLabel: 'Легенда' }],
    },
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('heading', { name: 'Power Tier List' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Лидер Power Tier: по подписке. Узнать, как открыть' })).toBeVisible();
    await expect(canvas.queryAllByRole('button', { name: /^Скопировать код колоды/ })).toHaveLength(0);
  },
};
