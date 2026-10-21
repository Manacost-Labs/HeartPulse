import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, waitFor } from 'storybook/test';
import { loadTransitionPresets } from './lazyTransitionPresets';
import { MODE_ORDER } from './transitionOrder';
import { useListTransition } from './useListTransition';
import { useViewEntrance } from './useViewEntrance';
import { ViewSwitch } from './ViewSwitch';

const meta = {
  title: 'Components/Transitions/ViewSwitch',
  component: ViewSwitch,
  args: { viewKey: 'standard', children: <p>Стандарт</p> },
  // On the site the navigation bridge loads the preset engine at idle; stories load it up front.
  loaders: [async () => { await loadTransitionPresets(); return {}; }],
} satisfies Meta<typeof ViewSwitch>;
export default meta;
type Story = StoryObj<typeof meta>;

const animates = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;
const scriptAnimations = (root: HTMLElement) => root.getAnimations({ subtree: true })
  .filter(animation => !(animation instanceof CSSAnimation) && !(animation instanceof CSSTransition));

const MODES = { standard: 'Стандарт', wild: 'Вольный' } as const;

function ModePreview() {
  const [mode, setMode] = useState<(typeof MODE_ORDER)[number]>('standard');
  return <div style={{ maxWidth: 520 }}>
    <div role="group" aria-label="Формат" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
      {MODE_ORDER.map(id => <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id)}>{MODES[id]}</button>)}
    </div>
    <ViewSwitch viewKey={mode} order={MODE_ORDER}>
      <section aria-label={`Мета: ${MODES[mode]}`} style={{ padding: 16, border: '1px solid #c0954e', borderRadius: 8 }}>
        <h2>{MODES[mode]}</h2>
        <p>{mode === 'standard' ? 'Биг-шаман, дракон-жрец, нежить-рыцарь' : 'Мех-паладин, рено-маг, спелл-друид, пират-воин'}</p>
      </section>
    </ViewSwitch>
  </div>;
}

/** Server markup and the first paint: nothing moves. */
export const Initial: Story = {
  render: () => <ModePreview />,
  play: async ({ canvasElement }) => { await expect(scriptAnimations(canvasElement)).toHaveLength(0); },
};

/** Стандарт → Вольный slides along x towards the chosen mode; the old view leaves inert and hidden. */
export const ModeSwitch: Story = {
  render: () => <ModePreview />,
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Вольный' }));
    await expect(canvas.getByRole('heading', { name: 'Вольный' })).toBeInTheDocument();
    const leaving = canvasElement.querySelector('[data-leaving]');
    if (animates()) {
      await expect(leaving).toHaveAttribute('aria-hidden', 'true');
      await expect(scriptAnimations(canvasElement).length).toBeGreaterThan(0);
      for (const animation of scriptAnimations(canvasElement)) await expect(animation.effect.getTiming().duration).toBe(220);
    }
    await waitFor(() => expect(canvasElement.querySelector('[data-leaving]')).toBeNull());
    await expect(canvas.getByRole('heading', { name: 'Вольный' })).toBeVisible();
  },
};

const VIEWS = ['cards', 'tiers', 'table'] as const;
const VIEW_LABELS = { cards: 'Карточки', tiers: 'Тиры', table: 'Таблица' } as const;

/** Tabs of one page: forward to a later tab, back to an earlier one. */
export const Tabs: Story = {
  render: function Render() {
    const [view, setView] = useState<(typeof VIEWS)[number]>('cards');
    return <div style={{ maxWidth: 520 }}>
      <div role="group" aria-label="Вид" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {VIEWS.map(id => <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)}>{VIEW_LABELS[id]}</button>)}
      </div>
      <ViewSwitch viewKey={view} order={VIEWS}><h2>{VIEW_LABELS[view]}</h2></ViewSwitch>
    </div>;
  },
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Таблица' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Тиры' }));
    // A change during a change takes over: at most the two latest views are mounted.
    await expect(canvasElement.querySelectorAll('.ui-page-transition__page').length).toBeLessThanOrEqual(2);
    await waitFor(() => expect(canvasElement.querySelector('[data-leaving]')).toBeNull());
    await expect(canvas.getByRole('heading', { name: 'Тиры' })).toBeVisible();
  },
};

const CARDS = [
  { id: 1, name: 'Сфера всезнания', rarity: 'common' },
  { id: 2, name: 'Призрачные кости', rarity: 'rare' },
  { id: 3, name: 'Громовой молот', rarity: 'epic' },
  { id: 4, name: 'Молот Сумерек', rarity: 'legendary' },
  { id: 5, name: 'Сказочный лес', rarity: 'rare' },
  { id: 6, name: 'Ледяная стрела', rarity: 'common' },
  { id: 7, name: 'Ящер-ведун', rarity: 'epic' },
  { id: 8, name: 'Жрица Элуны', rarity: 'legendary' },
];
const RARITIES = ['all', 'common', 'rare', 'epic', 'legendary'] as const;
const RARITY_LABELS = { all: 'Все', common: 'Обычные', rare: 'Редкие', epic: 'Эпические', legendary: 'Легендарные' } as const;

function CardGridPreview() {
  const [rarity, setRarity] = useState<(typeof RARITIES)[number]>('all');
  const cards = CARDS.filter(card => rarity === 'all' || card.rarity === rarity);
  const listRef = useListTransition<HTMLDivElement>(cards);
  return <div style={{ maxWidth: 560 }}>
    <div role="group" aria-label="Редкость" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
      {RARITIES.map(id => <button key={id} type="button" aria-pressed={rarity === id} onClick={() => setRarity(id)}>{RARITY_LABELS[id]}</button>)}
    </div>
    <div ref={listRef} data-testid="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
      {cards.map(card => <article key={card.id} style={{ height: 96, padding: 8, borderRadius: 8, border: '1px solid #c0954e', background: '#fff3d8' }}>{card.name}</article>)}
    </div>
  </div>;
}

/** A rarity filter: new cards enter row by row (fade-through), the cards that stay glide to their places. */
export const CardFilter: Story = {
  render: () => <CardGridPreview />,
  play: async ({ canvas, canvasElement }) => {
    await expect(scriptAnimations(canvasElement)).toHaveLength(0);
    await userEvent.click(canvas.getByRole('button', { name: 'Легендарные' }));
    // Both legendaries stayed in the list and moved to the first row.
    if (animates()) await expect(scriptAnimations(canvasElement).map(animation => (animation.effect as KeyframeEffect).getKeyframes()[0].transform)).toEqual(expect.arrayContaining([expect.stringMatching(/^translate\(/)]));
    await userEvent.click(canvas.getByRole('button', { name: 'Все' }));
    if (animates()) await expect(scriptAnimations(canvasElement).some(animation => Number((animation.effect as KeyframeEffect).getKeyframes()[0].opacity) === 0)).toBe(true);
    await Promise.all(scriptAnimations(canvasElement).map(animation => animation.finished));
    await expect(canvas.getByTestId('grid').children).toHaveLength(CARDS.length);
  },
};

/** Галерея ↔ Таблица: the light switch, only the entering half of fade-through on the container. */
export const GalleryTable: Story = {
  render: function Render() {
    const [view, setView] = useState<'gallery' | 'table'>('gallery');
    const ref = useViewEntrance<HTMLDivElement>(view);
    return <div style={{ maxWidth: 520 }}>
      <div role="group" aria-label="Вид списка" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button type="button" aria-pressed={view === 'gallery'} onClick={() => setView('gallery')}>Галерея</button>
        <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}>Таблица</button>
      </div>
      <div ref={ref} data-testid="view">{view === 'gallery' ? <p>Сетка карт</p> : <table><tbody><tr><td>Сфера всезнания</td><td>0</td></tr></tbody></table>}</div>
    </div>;
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId('view').getAnimations()).toHaveLength(0);
    await userEvent.click(canvas.getByRole('button', { name: 'Таблица' }));
    const [entrance] = canvas.getByTestId('view').getAnimations();
    if (animates()) await expect((entrance.effect as KeyframeEffect).getKeyframes()[0].transform).toBe('scale(0.92)');
    await entrance?.finished;
    await expect(canvas.getByRole('cell', { name: 'Сфера всезнания' })).toBeVisible();
  },
};

const MODE_ROWS = {
  standard: ['Биг-шаман', 'Дракон-жрец', 'Нежить-рыцарь'],
  wild: ['Мех-паладин', 'Рено-маг', 'Пират-воин', 'Спелл-друид'],
} as const;

/** The archetype list's Стандарт → Вольный: the other mode's rows slide in towards it (shared-x), row by row. */
export const ListModeSwitch: Story = {
  render: function Render() {
    const [mode, setMode] = useState<(typeof MODE_ORDER)[number]>('standard');
    const rows = MODE_ROWS[mode].map(name => `${mode}:${name}`);
    const ref = useListTransition<HTMLOListElement>(rows, undefined, { key: mode, order: MODE_ORDER });
    return <div style={{ maxWidth: 520 }}>
      <div role="group" aria-label="Формат" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {MODE_ORDER.map(id => <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id)}>{MODES[id]}</button>)}
      </div>
      <ol ref={ref} aria-label="Архетипы">{rows.map(row => <li key={row} style={{ padding: 8 }}>{row.split(':')[1]}</li>)}</ol>
    </div>;
  },
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Вольный' }));
    const frames = scriptAnimations(canvasElement).map(animation => (animation.effect as KeyframeEffect).getKeyframes()[0]);
    if (animates()) await expect(frames.every(frame => frame.transform === 'translateX(30px)')).toBe(true);
    await Promise.all(scriptAnimations(canvasElement).map(animation => animation.finished));
    await expect(canvas.getByRole('list', { name: 'Архетипы' }).children).toHaveLength(4);
  },
};
