import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor } from 'storybook/test';
import ConstructedArchetypeDeckGallery from './ConstructedArchetypeDeckGallery';
import { ArchetypeRadarSection, BuildComparisonSection } from './ArchetypeInsightSlots';
import real from '../../tests/fixtures/archetype-compare-real-20261021.json';
import '../route-parchment.css';
import './ConstructedArchetypes.css';

// Wild Big Shaman as hearthpulse.net served it on 21 Oct 2026: 17 builds with their resolved
// lists and parchment renders, the format's catalog and HSGuru Legend matchups. The fetch stub
// answers the page's own requests from the capture; images still load from their real paths.
function installRealData() {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), window.location.origin);
    const json = (payload: unknown) => new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (url.pathname === '/api/deck/resolve') return json((real.decks as Record<string, unknown>)[url.searchParams.get('code') ?? '']);
    if (url.pathname === '/api/deck/render') {
      const body = JSON.parse(String(init?.body ?? '{}')) as { deckCode?: string };
      return json((real.renders as Record<string, unknown>)[body.deckCode ?? '']);
    }
    if (url.pathname === '/api/constructed-archetypes/teaser') return json(real.catalog);
    if (url.pathname === '/api/standard/matchups') return json(real.matchups);
    return original(input, init);
  }) as typeof fetch;
  return () => { globalThis.fetch = original; };
}

const meta = {
  title: 'Archetype detail/Comparisons on real data',
  parameters: { layout: 'fullscreen', a11y: { test: 'off' } },
  tags: ['!autodocs'],
  beforeEach: installRealData,
  decorators: [Story => <div style={{ background: '#ecd9ae', minHeight: '100vh' }}><main className="archetypes-page archetype-detail-page" style={{ maxWidth: 1180, margin: '0 auto', padding: '1rem 0' }}><Story /></main></div>],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const item = real.item as Parameters<typeof ArchetypeRadarSection>[0]['item'] & { builds: typeof real.item.builds; archetype: string };

export const Gallery: Story = {
  render: () => <section className="archetype-builds"><ConstructedArchetypeDeckGallery builds={item.builds.slice(0, 6)} format="wild" archetype={item.archetype} classKey="shaman" /></section>,
};

/** As the page opens it: the heading and one button; nothing of the comparison is requested yet. */
export const BuildsCollapsed: Story = {
  render: () => <BuildComparisonSection builds={item.builds} format="wild" archetype={item.archetype} />,
  play: async ({ canvas, canvasElement }) => {
    const toggle = canvas.getByRole('button', { name: 'Сравнить сборки' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(canvasElement.querySelector('#archetype-compare-content')).not.toBeVisible();
    await expect(canvasElement.querySelector('.build-picker')).toBeNull();
  },
};

const openComparison = async (canvas: { getByRole: (role: string, options: { name: string }) => HTMLElement }) => {
  await userEvent.click(canvas.getByRole('button', { name: 'Сравнить сборки' }));
};

/** #1 (4 050 games, 61.5%) against #2 (2 263, 63.5%): the gap is inside both intervals. */
export const Builds: Story = {
  render: () => <BuildComparisonSection builds={item.builds} format="wild" archetype={item.archetype} />,
  play: async ({ canvas }) => {
    await openComparison(canvas);
    await expect(canvas.getByRole('button', { name: 'Свернуть' })).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(canvas.getByRole('img', { name: /^Кривая маны/ })).toBeVisible());
    await expect(canvas.getByRole('img', { name: /^95% интервал винрейта: #1 60,0–63,0%, #2 61,5–65,5%$/ })).toBeVisible();
  },
};

/** Picking: Б moves to #3, then A takes #3 and the sides swap; the swap button trades them back. */
export const BuildsPicking: Story = {
  render: () => <BuildComparisonSection builds={item.builds} format="wild" archetype={item.archetype} />,
  play: async ({ canvas }) => {
    await openComparison(canvas);
    await expect(await canvas.findByText('В пределах погрешности')).toBeVisible();
    await expect(canvas.getByText('#1 надёжнее · ×1,8')).toBeVisible();
    await waitFor(() => expect(canvas.getByRole('img', { name: /^Кривая маны/ })).toBeVisible());
    await expect(canvas.getByRole('heading', { name: /Только в #1/ })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Сборка #3 справа (Б)' }));
    await expect(await canvas.findByRole('heading', { name: /Только в #3/ })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Сборка #3 слева (A)' }));
    await expect(canvas.getByRole('button', { name: 'Сборка #1 справа (Б)' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(canvas.getByRole('button', { name: 'Поменять A и Б местами' }));
    await expect(canvas.getByRole('button', { name: 'Сборка #1 слева (A)' })).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.getByRole('button', { name: 'Сборка #3 справа (Б)' })).toHaveAttribute('aria-pressed', 'true');
    // Closing keeps the pair: reopening shows the same two builds.
    await userEvent.click(canvas.getByRole('button', { name: 'Свернуть' }));
    await openComparison(canvas);
    await expect(canvas.getByRole('button', { name: 'Сборка #3 справа (Б)' })).toHaveAttribute('aria-pressed', 'true');
  },
};

/** A list the server does not answer: the head-to-head table stays, the curve area offers a retry. */
export const BuildsListFailed: Story = {
  render: () => <BuildComparisonSection builds={item.builds} format="wild" archetype="Story Failing Lists" />,
  beforeEach: () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => new URL(String(input), window.location.origin).pathname === '/api/deck/resolve'
      ? new Response('{"error":"Не удалось разобрать колоду"}', { status: 503, headers: { 'Content-Type': 'application/json' } })
      : original(input, init)) as typeof fetch;
    return () => { globalThis.fetch = original; };
  },
  play: async ({ canvas }) => {
    await openComparison(canvas);
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Не удалось загрузить составы сборок.');
    await expect(canvas.getByRole('button', { name: 'Повторить' })).toBeVisible();
  },
};

/** Big Shaman is not in HSGuru's Legend matchup table, so the direct matchup says why it is missing. */
export const Radar: Story = {
  render: () => <ArchetypeRadarSection item={item} viewerId="story-viewer" />,
};

/** Search by part of a name inside the class groups. */
export const RadarSearch: Story = {
  render: () => <ArchetypeRadarSection item={item} viewerId="story-viewer" />,
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(/нет в таблице матчапов HSGuru/)).toBeVisible();
    const field = canvas.getByRole('combobox', { name: 'Сравнить с' });
    await userEvent.clear(field);
    await userEvent.type(field, 'вепр');
    await userEvent.click(await canvas.findByRole('option', { name: /Разбойник на Элвиннских вепрях/ }));
    await expect(canvas.getByText(/Биг Шаман .* чем Разбойник на Элвиннских вепрях\./)).toBeVisible();
  },
};

const ohnahra = real.catalog.items.find(entry => entry.archetype === "Ohn'ahra Big Shaman") as unknown as typeof item;

/** Ohn'ahra Big Shaman is in the table: the default opponent is the most played one with a published matchup. */
export const RadarWithMatchup: Story = {
  render: () => <ArchetypeRadarSection item={ohnahra} viewerId="story-viewer" />,
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(/побед Биг Шаман \(Ohn'ahra\) против/)).toBeVisible();
  },
};
